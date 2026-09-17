import argparse
import base64
import getpass
import hashlib
import json
import secrets
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urljoin, urlparse

import cbor2
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from jwcrypto import jwk as jw_jwk, jwe as jw_jwe
from pycose.algorithms import Es256
from pycose.headers import Algorithm
from pycose.keys import CoseKey
from pycose.keys.curves import P256
from pycose.keys.keyparam import EC2KpCurve, EC2KpD, EC2KpX, EC2KpY, KpAlg, KpKty
from pycose.keys.keytype import KtyEC2
from pycose.messages import Sign1Message
from typing import Callable, Dict, List, Optional

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPOSITORY_ROOT / ".env"
CA_BUNDLE = REPOSITORY_ROOT / "dc-agency/docker/ca-bundle.pem"
DEFAULT_SESSION_FILE = REPOSITORY_ROOT / "tests/artifacts/holder-session.json"
DEFAULT_WITH_QR_CODE = False
DEFAULT_WALLET_REDIRECT_URI = "openid-credential-offer://"
DEFAULT_HOLDER_CLIENT_ID = "00000000-0000-4000-8000-000000000000_vcholders"
DEFAULT_BROWSER_TIMEOUT_SECONDS = 300
DEFAULT_VERIFIER_STATUS_POLL_ATTEMPTS = 5
DEFAULT_VERIFIER_STATUS_POLL_INTERVAL_SECONDS = 2
DEFAULT_VISUAL_STEP_DELAY_SECONDS = 1.5
BANK_SIGNUP_PURPOSE = "signup"
BANK_EMPLOYMENT_PURPOSE = "employment"
HR_EMPLOYMENT_NAMESPACE = "com.example.hr.portal.1"
DEFAULT_LOAN_APPLICATION = {
    "loanAmount": "10000",
    "loanPurpose": "home-improvement",
    "repaymentTerm": "36",
    "phone": "0400 000 000",
}
DMV_PORTRAIT_BASE64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/4QBmRXhpZgAASUkqAAgAAAAEABoBBQABAAAAPgAAABsBBQABAAAARgAAACgBAwABAAAAAgAAADEBAgAQAAAATgAAAAAAAABgAAAAAQAAAGAAAAABAAAAUGFpbnQuTkVUIHYzLjMwAP/bAEMAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/bAEMBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/ACiiigD/2Q=="
)

DMV_PROFILE = {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "licenseNumber": "DL-987654321",
    "issueDate": "2026-04-18",
    "expiryDate": "2027-04-18",
    "dateOfBirth": "1990-01-15",
    "residentAddress": "123 High Street, Southport, QLD 4217, Australia",
    "residentCity": "Gold Coast",
    "residentState": "QLD",
    "residentPostalCode": "4217",
    "residentCountry": "AU",
    "issuingCountry": "AU",
    "unDistinguishingSign": "AU",
    "issuingAuthority": "Department of Motor Vehicles",
    "drivingPrivileges": [
        {"vehicle_category_code": "C", "issue_date": "2026-04-18", "expiry_date": "2027-04-18"},
        {"vehicle_category_code": "RE", "issue_date": "2026-04-18", "expiry_date": "2027-04-18"},
    ],
}

HR_EMPLOYMENT_PROFILE = {
    "firstName": "Mia",
    "lastName": "Kerr",
    "email": "mia.kerr@examplecorp.test",
    "employeeId": "EMP-48217",
    "documentNumber": "POE-2026-48217",
    "employerName": "International Business Machines",
    "employerEntityId": "ABN 12 345 678 901",
    "jobTitle": "Technical Specialist",
    "department": "Engineering",
    "employmentStatus": "Active",
    "employmentType": "Full-time, permanent",
    "startDate": "2021-07-12",
    "annualIncome": "AUD 98,400",
    "payFrequency": "Fortnightly",
    "workLocation": "Brisbane, QLD",
    "managerName": "Elena Park",
    "issuingAuthority": "HR Portal Credential Services",
}

BANK_SIGNUP_ATTRIBUTE_IDS = {
    "firstName": "given_name",
    "lastName": "family_name",
}

BANK_EMPLOYMENT_ATTRIBUTE_IDS = {
    "firstName": "given_name",
    "lastName": "family_name",
    "annualIncome": "annual_income",
}

# this script is basically acting like three parties at once.
# first it behaves like the dmv issuer and creates the offer.
# then it behaves like the holder wallet and redeems that offer.
# finally it behaves like the holder again when the verifier asks for a presentation.
# the whole point is to run the real protocol flow without needing an actual phone wallet in the middle.


class WorkflowBlocked(RuntimeError):
    pass


def repository_root(script_path=None):
    """Return the repository root for this moved test script."""
    return Path(script_path or __file__).resolve().parents[2]


def authorization_code_from_callback(callback_url):
    """Extract an OAuth authorization code without retaining the callback URL."""
    code_values = parse_qs(urlparse(callback_url).query).get("code")
    if not code_values or not code_values[0]:
        raise RuntimeError("OAuth callback did not include an authorization code.")
    return code_values[0]


def summarise_wallet_authorization(wallet_authorization):
    """Keep routing metadata, but never persist a one-time authorization code."""
    return {
        key: value
        for key, value in wallet_authorization.items()
        if key not in {"authorization_code", "state"}
    }


def prompt_oauth_credentials():
    username = input("OAuth username: ").strip()
    password = getpass.getpass("OAuth password: ")
    if not username or not password:
        raise RuntimeError("An OAuth username and password are required.")
    return username, password


@dataclass
class WorkflowSession:
    # this is just our running notebook of what happened.
    # every major step drops its important outputs in here so that the final json file
    # tells the story of the whole run without us needing to reconstruct it from logs.
    started_at: str
    agency_url: str
    issuer_app_url: str
    verifier_app_url: str
    dmv_profile: dict
    hr_app_url: Optional[str] = None
    hr_profile: Optional[dict] = None
    issuer_offer: Optional[dict] = None
    issuer_offers: Dict[str, dict] = field(default_factory=dict)
    verifier_exchange: Optional[dict] = None
    verifier_exchanges: Dict[str, dict] = field(default_factory=dict)
    bank_signup_status: Optional[dict] = None
    holder_token_status: Optional[dict] = None
    holder_credential_status: Optional[dict] = None
    holder_credential_statuses: Dict[str, dict] = field(default_factory=dict)
    verification_status: Optional[dict] = None
    verification_statuses: Dict[str, dict] = field(default_factory=dict)
    loan_application_status: Optional[dict] = None
    holder_debug: Optional[dict] = None
    completed_steps: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def base64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def base64url_decode(value):
    return base64.urlsafe_b64decode(value + ("=" * (-len(value) % 4)))


def parse_env_file(path):
    # the repo already writes everything we need into .env, so this helper just turns it into a dict.
    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def validate_env_values(values):
    required_keys = [
        "REACT_APP_ACCOUNT_URL",
        "DMV_URL",
        "BANK_URL",
        "CREDENTIAL_DEFINITION_ID",
        "HR_URL",
        "HR_CREDENTIAL_DEFINITION_ID",
        "HR_EXCHANGE_TEMPLATE_ID",
    ]
    missing_keys = [key for key in required_keys if not values.get(key)]
    if missing_keys:
        raise RuntimeError(f"The bypass flow is missing required .env values: {', '.join(missing_keys)}")

    return values


def require_ok(response, label):
    if response.ok:
        return

    raise RuntimeError(f"{label} failed: {response.status_code} {response.text}")


def map_dmv_offer_payload(profile):
    # this is the fake dmv record we ask dc-agency to issue.
    # the field names here are the mdoc namespace keys expected by the sample configuration.
    return {
        "credential_configuration_ids": [profile["credential_definition_id"]],
        "credential_data": {
            "org.iso.18013.5.1:document_number": profile["licenseNumber"],
            "org.iso.18013.5.1:issue_date": profile["issueDate"],
            "org.iso.18013.5.1:expiry_date": profile["expiryDate"],
            "org.iso.18013.5.1:given_name": profile["firstName"],
            "org.iso.18013.5.1:family_name": profile["lastName"],
            "org.iso.18013.5.1:birth_date": profile["dateOfBirth"],
            "org.iso.18013.5.1:issuing_country": profile["issuingCountry"],
            "org.iso.18013.5.1:issuing_authority": profile["issuingAuthority"],
            "org.iso.18013.5.1:portrait": DMV_PORTRAIT_BASE64,
            "org.iso.18013.5.1:driving_privileges": profile["drivingPrivileges"],
            "org.iso.18013.5.1:un_distinguishing_sign": profile["unDistinguishingSign"],
            "org.iso.18013.5.1:resident_address": profile["residentAddress"],
            "org.iso.18013.5.1:resident_city": profile["residentCity"],
            "org.iso.18013.5.1:resident_state": profile["residentState"],
            "org.iso.18013.5.1:resident_postal_code": profile["residentPostalCode"],
            "org.iso.18013.5.1:resident_country": profile["residentCountry"],
        },
    }


def map_hr_offer_payload(profile):
    # The HR portal form normally supplies these employment fields. Because this
    # test bypasses that form, it must send the same credential_data explicitly.
    namespace_prefix = f"{HR_EMPLOYMENT_NAMESPACE}:"
    return {
        "credential_configuration_ids": [profile["credential_definition_id"]],
        "credential_data": {
            f"{namespace_prefix}employee_id": profile["employeeId"],
            f"{namespace_prefix}document_number": profile["documentNumber"],
            f"{namespace_prefix}given_name": profile["firstName"],
            f"{namespace_prefix}family_name": profile["lastName"],
            f"{namespace_prefix}email": profile["email"],
            f"{namespace_prefix}employer_name": profile["employerName"],
            f"{namespace_prefix}employer_entity_id": profile["employerEntityId"],
            f"{namespace_prefix}job_title": profile["jobTitle"],
            f"{namespace_prefix}department": profile["department"],
            f"{namespace_prefix}employment_status": profile["employmentStatus"],
            f"{namespace_prefix}employment_type": profile["employmentType"],
            f"{namespace_prefix}start_date": profile["startDate"],
            f"{namespace_prefix}annual_income": profile["annualIncome"],
            f"{namespace_prefix}pay_frequency": profile["payFrequency"],
            f"{namespace_prefix}work_location": profile["workLocation"],
            f"{namespace_prefix}manager_name": profile["managerName"],
            f"{namespace_prefix}issuing_authority": profile["issuingAuthority"],
        },
    }

def summarise_http_response(response):
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        try:
            body = response.json()
        except ValueError:
            body = response.text
    else:
        body = response.text

    return {
        "status_code": response.status_code,
        "ok": response.ok,
        "content_type": content_type,
        "body": body,
    }


def summarised_response_message(response_summary):
    body = response_summary.get("body")
    if isinstance(body, dict):
        return body.get("message") or body.get("error_description") or json.dumps(body, separators=(",", ":"))
    return str(body)


def parse_uri_query(uri):
    # the qr/deep-link payloads in this repo are just uris with query params,
    # so normalize them once here instead of repeating parse_qs everywhere.
    parsed = urlparse(uri)
    params = parse_qs(parsed.query)
    return {key: values[0] if len(values) == 1 else values for key, values in params.items()}


def compact_json_body(payload):
    # the sample app proxies are happiest when the body we send matches the exact bytes declared in transit,
    # so we serialize once here and reuse that same compact form for app-facing json posts.
    return json.dumps(payload, separators=(",", ":"))


def mark_step_completed(workflow_session, step_name):
    if step_name not in workflow_session.completed_steps:
        workflow_session.completed_steps.append(step_name)


def verification_attributes_to_map(attributes):
    attribute_map = {}
    for attribute in attributes or []:
        attribute_id = attribute.get("id")
        if attribute_id:
            attribute_map[attribute_id] = attribute.get("value")
    return attribute_map


def build_bank_signup_payload(verification_attributes, bank_email):
    attribute_map = verification_attributes_to_map(verification_attributes)
    signup_payload = {}
    missing_fields = []

    for field_name, attribute_id in BANK_SIGNUP_ATTRIBUTE_IDS.items():
        attribute_value = attribute_map.get(attribute_id)
        if attribute_value in {None, ""}:
            missing_fields.append(f"{field_name} <- {attribute_id}")
            continue
        signup_payload[field_name] = attribute_value

    if missing_fields:
        raise RuntimeError(
            "Bank signup could not be completed because the verifier did not return required claims. "
            f"Missing: {', '.join(missing_fields)}"
        )

    return {**signup_payload, "email": bank_email}


def build_loan_application_payload(verification_attributes):
    attribute_map = verification_attributes_to_map(verification_attributes)
    verified_employment = {}
    missing_fields = []

    for field_name, attribute_id in BANK_EMPLOYMENT_ATTRIBUTE_IDS.items():
        attribute_value = attribute_map.get(attribute_id)
        if attribute_value in {None, ""}:
            missing_fields.append(f"{field_name} <- {attribute_id}")
            continue
        verified_employment[field_name] = attribute_value

    if missing_fields:
        raise RuntimeError(
            "The loan application could not be populated because employment verification did not return required claims. "
            f"Missing: {', '.join(missing_fields)}"
        )

    return {
        "applicant": f"{verified_employment['firstName']} {verified_employment['lastName']}".strip(),
        "verifiedEmployment": verified_employment,
        **DEFAULT_LOAN_APPLICATION,
    }


def submit_loan_application(workflow_session, loan_application_payload):
    # LoanApplicationCard currently has no submission route: after the browser's
    # required-field validation it only sets applicationSubmitted=true. Record
    # that same client-side state transition after the real employment proof is
    # accepted, without pretending that a backend loan record was created.
    workflow_session.loan_application_status = {
        "completed": True,
        "client_side_only": True,
        "message": "Loan application submitted for review using the verified employment credential.",
        "application": loan_application_payload,
    }
    return workflow_session.loan_application_status


def skipped_status(message):
    return {
        "completed": False,
        "skipped": True,
        "message": message,
    }


def record_verifier_exchange(workflow_session, verifier_exchange, purpose=BANK_SIGNUP_PURPOSE):
    # keep the verifier exchange pared down to the fields we actually need later.
    # the raw verifier response is bigger, but these are the parts that drive the holder presentation logic.
    wallet_engagement = verifier_exchange.get("wallet_engagement")
    wallet_engagement_params = parse_uri_query(wallet_engagement or "")
    workflow_session.verifier_exchange = {
        "id": verifier_exchange.get("id"),
        "execution_state": verifier_exchange.get("execution_state"),
        "verifier_state": wallet_engagement_params.get("state") or verifier_exchange.get("authorize_request", {}).get("state"),
        "verifier_response_uri": wallet_engagement_params.get("response_uri") or verifier_exchange.get("authorize_request", {}).get("response_uri"),
        "qr": verifier_exchange.get("qr"),
        "wallet_engagement": wallet_engagement,
        "wallet_engagement_params": wallet_engagement_params,
    }
    workflow_session.verifier_exchanges[purpose] = workflow_session.verifier_exchange
    return workflow_session.verifier_exchange

@dataclass(frozen=True)
class IssuerFlowConfig:
    key: str
    app_name: str
    issuer_app_url: str
    profile: dict
    offer_payload_builder: Callable[[dict], dict]


@dataclass(frozen=True)
class StoredCredential:
    issued_credential: str
    private_key_pem: str
    issued_response: dict


class BrowserAuthClient:
    """Drive interactive OAuth while keeping browser state out of run artifacts."""

    username_selectors = (
        'input[autocomplete="username"]:visible, input[type="email"]:visible, '
        'input[name*="user" i]:visible, input[name*="email" i]:visible, '
        'input[id*="user" i]:visible, input[id*="email" i]:visible'
    )
    password_selectors = 'input[type="password"]:visible, input[autocomplete="current-password"]:visible'

    def __init__(
        self,
        username,
        password,
        headless=False,
        timeout_seconds=DEFAULT_BROWSER_TIMEOUT_SECONDS,
        visual=False,
    ):
        self.username = username
        self.password = password
        self.headless = headless
        self.timeout_seconds = timeout_seconds
        self.visual = visual
        self._playwright = None
        self._browser = None
        self.issuer_context = None
        self.cookie_source_context = None

    def __enter__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as error:
            raise RuntimeError(
                "Playwright is required. Install project requirements and run 'python -m playwright install chromium'."
            ) from error

        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=self.headless,
            slow_mo=150 if self.visual else 0,
        )
        context_options = {"ignore_https_errors": True}
        self.issuer_context = self._browser.new_context(**context_options)
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    @staticmethod
    def _is_callback(url, callback_prefix):
        callback = urlparse(callback_prefix)
        candidate = urlparse(url)
        return (
            candidate.scheme == callback.scheme
            and candidate.netloc == callback.netloc
            and candidate.path.rstrip("/") == callback.path.rstrip("/")
        )

    @staticmethod
    def _first_visible_locator(page, selector):
        locator = page.locator(selector)
        return locator.first if locator.count() else None

    def _select_cloud_directory_if_needed(self, page):
        """
        IBM Verify may show a "Sign in without a password / Passkey" screen where the
        username/password form is hidden. The sign-in method selector is a Carbon v9
        <ul id="dropdown-id" class="bx--dropdown" tabindex="0"> component. Clicking the
        <ul> opens the list; the Cloud Directory option is
        <a data-ci-key="Cloud Directory" class="bx--dropdown-link id-source-option">.
        """
        # Detect the passkey screen: username input present but hidden.
        username_input = page.locator("input[name='username'], input[id='user-name-input']")
        if username_input.count() == 0 or username_input.first.is_visible():
            return  # already on a username/password form, nothing to do

        # Click the Carbon dropdown header to open the sign-in method list.
        dropdown = page.locator("ul#dropdown-id.bx--dropdown")
        if dropdown.count() == 0:
            return  # unexpected page layout — let the normal flow handle it

        dropdown.first.click()

        # Wait for the Cloud Directory option to become visible then click it.
        cloud_dir = page.locator("a.bx--dropdown-link.id-source-option[data-ci-key='Cloud Directory']")
        try:
            cloud_dir.first.wait_for(state="visible", timeout=5_000)
        except Exception:
            return  # dropdown did not open — fall through to normal flow

        cloud_dir.first.click()

        # Wait for the username input to become visible before returning.
        try:
            page.locator("input[name='username'], input[id='user-name-input']").first.wait_for(
                state="visible", timeout=5_000
            )
        except Exception:
            pass  # will be retried on the next poll iteration

    def _submit_known_credentials(self, page, username_submitted, password_submitted):
        # If IBM Verify shows the passkey screen, navigate to Cloud Directory first.
        if not username_submitted and not password_submitted:
            self._select_cloud_directory_if_needed(page)

        password = self._first_visible_locator(page, self.password_selectors)
        username = self._first_visible_locator(page, self.username_selectors)

        if password and not password_submitted:
            if username and not username_submitted:
                username.fill(self.username)
            password.fill(self.password)
            password.press("Enter")
            return True, True

        if username and not username_submitted:
            username.fill(self.username)
            username.press("Enter")
            return True, password_submitted

        return username_submitted, password_submitted

    def _complete_authorization(self, context, authorization_url, callback_prefix):
        page = context.new_page()
        callback_urls = []

        def capture_request(request):
            if self._is_callback(request.url, callback_prefix):
                callback_urls.append(request.url)

        page.on("request", capture_request)
        page.goto(authorization_url, wait_until="domcontentloaded", timeout=30_000)

        username_submitted = False
        password_submitted = False
        manual_message_shown = False
        deadline = time.monotonic() + self.timeout_seconds
        while time.monotonic() < deadline:
            if callback_urls:
                status_response = context.request.get(f"{urlparse(callback_prefix).scheme}://{urlparse(callback_prefix).netloc}/auth/status")
                if status_response.ok and status_response.json().get("authenticated"):
                    return callback_urls[-1]

            username_submitted, password_submitted = self._submit_known_credentials(
                page, username_submitted, password_submitted
            )
            if password_submitted and not manual_message_shown:
                print(
                    "Complete any remaining OAuth interaction in the browser (for example MFA or consent). "
                    "The script will resume when the provider redirects."
                )
                manual_message_shown = True
            page.wait_for_timeout(500)

        raise WorkflowBlocked(
            "OAuth browser login did not reach its callback within five minutes. "
            "Complete the visible sign-in flow, then rerun the script."
        )

    def complete_app_login(self, authorization_url, callback_prefix):
        return self._complete_authorization(self.issuer_context, authorization_url, callback_prefix)

    def copy_browser_cookies_to(self, session, context=None):
        """Copy only browser cookies into requests; credentials and local storage are never copied."""
        cookie_context = context or self.cookie_source_context or self.issuer_context
        for cookie in cookie_context.cookies():
            cookie_options = {
                "path": cookie.get("path", "/"),
                "secure": cookie.get("secure", False),
            }
            cookie_domain = cookie.get("domain")
            if cookie_domain and cookie_domain != "localhost":
                cookie_options["domain"] = cookie_domain
            session.cookies.set(cookie["name"], cookie["value"], **cookie_options)

    def complete_wallet_authorization(self, authorization_url, wallet_session):
        self.copy_browser_cookies_to(wallet_session)
        next_url = authorization_url

        for _ in range(10):
            response = wallet_session.get(next_url, allow_redirects=False, timeout=30)
            location = response.headers.get("location")
            if location:
                next_url = urljoin(next_url, location)
                if self._is_callback(next_url, DEFAULT_WALLET_REDIRECT_URI):
                    return next_url
                if urlparse(next_url).scheme in {"http", "https"}:
                    continue
                redirect = urlparse(next_url)
                raise RuntimeError(
                    "Wallet authorization redirected to an unsupported URI "
                    f"(scheme={redirect.scheme!r}, host={redirect.netloc!r}, path={redirect.path!r})."
                )

            require_ok(response, "Authorize wallet")
            raise WorkflowBlocked("Wallet authorization did not redirect to the credential-offer callback.")

        raise WorkflowBlocked("Wallet authorization exceeded the maximum number of HTTP redirects.")


class VisualFlowClient:
    """Drive the sample app pages while the Python wallet handles QR handoffs."""

    def __init__(self, browser_auth, step_delay_seconds=DEFAULT_VISUAL_STEP_DELAY_SECONDS):
        self.browser_auth = browser_auth
        self.step_delay_seconds = step_delay_seconds
        self.contexts = {}
        self.pages = {}

    def context_for(self, key):
        if key not in self.contexts:
            self.contexts[key] = self.browser_auth._browser.new_context(ignore_https_errors=True)
        return self.contexts[key]

    def show(self, page, message, delay_seconds=None):
        print(f"Visual step: {message}")
        page.bring_to_front()
        page.wait_for_timeout(int(1000 * (self.step_delay_seconds if delay_seconds is None else delay_seconds)))

    @staticmethod
    def wait_for_visible(page, locator, label, timeout=30_000):
        try:
            locator.wait_for(state="visible", timeout=timeout)
        except Exception as error:
            page_text = page.locator("body").inner_text(timeout=5_000)
            raise RuntimeError(
                f"The visual flow did not reach {label}. Current URL: {page.url}. "
                f"Visible page text: {page_text[:1200]}"
            ) from error

    def authenticate_app(self, key, app_url, landing_path):
        context = self.context_for(key)
        login_response = context.request.get(f"{app_url.rstrip('/')}/auth/login")
        if not login_response.ok:
            raise RuntimeError(
                f"Start visual {key} login failed: {login_response.status} {login_response.text()}"
            )
        auth_url = login_response.json().get("authUrl")
        if not auth_url:
            raise RuntimeError(f"The visual {key} login response did not include an authUrl.")
        self.browser_auth._complete_authorization(
            context,
            auth_url,
            f"{app_url.rstrip('/')}/logincallback",
        )
        page = context.pages[-1]
        page.wait_for_url(f"**{landing_path}", wait_until="domcontentloaded", timeout=30_000)
        self.pages[key] = page
        self.browser_auth.cookie_source_context = context
        return page

    def credential_offer_uri(self, page, button_name):
        page.get_by_role("button", name=button_name, exact=True).first.click()
        wallet_link = page.locator('a[href^="openid-credential-offer:"]').first
        wallet_link.wait_for(state="visible", timeout=30_000)
        offer_uri = wallet_link.get_attribute("href")
        if not offer_uri:
            raise RuntimeError(f"The {button_name} dialog did not expose a credential offer URI.")
        return offer_uri

    def verifier_wallet_engagement(self, page, button_name):
        page.get_by_role("button", name=button_name, exact=True).click()
        wallet_link = page.locator('a[href^="openid4vp:"]').first
        wallet_link.wait_for(state="visible", timeout=30_000)
        wallet_engagement = wallet_link.get_attribute("href")
        if not wallet_engagement:
            raise RuntimeError(f"The {button_name} dialog did not expose a verifier wallet engagement URI.")
        return wallet_engagement

    def copy_cookies_to(self, key, session):
        self.browser_auth.copy_browser_cookies_to(session, self.context_for(key))


class IssuerClient:
    def __init__(self, app_name, issuer_app_url, ca_bundle, offer_payload_builder):
        self.app_name = app_name
        self.issuer_app_url = issuer_app_url.rstrip("/")
        self.ca_bundle = str(ca_bundle)
        self.offer_payload_builder = offer_payload_builder
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.verify = self.ca_bundle
        self.session.headers.update({"Accept": "application/json"})

    def verify_option_for_url(self, url):
        return self.ca_bundle

    def is_authenticated(self):
        # the dmv proxy routes are session protected, so first ask the app whether this session cookie is already logged in.
        auth_status_url = f"{self.issuer_app_url}/auth/status"
        response = self.session.get(auth_status_url, timeout=30, verify=self.verify_option_for_url(auth_status_url))
        if not response.ok:
            return False
        return bool(response.json().get("authenticated"))

    def authenticate_app_session(self, browser_auth):
        # creating issuer offers through the dmv app means we have to behave like the web user first,
        # otherwise the proxy route refuses the request before it ever reaches dc-agency.
        if self.is_authenticated():
            return

        login_url = f"{self.issuer_app_url}/auth/login"
        login_response = self.session.get(login_url, timeout=30, verify=self.verify_option_for_url(login_url))
        require_ok(login_response, f"Start {self.app_name} login")
        login_payload = login_response.json()
        auth_url = login_payload.get("authUrl")
        if not auth_url:
            raise RuntimeError(f"The {self.app_name} login response did not include an authUrl.")

        browser_auth.complete_app_login(auth_url, f"{self.issuer_app_url}/logincallback")
        browser_auth.copy_browser_cookies_to(self.session)

        if not self.is_authenticated():
            raise RuntimeError(f"The {self.app_name} login completed but no authenticated session was established.")

    def create_credential_offer(self, profile, browser_auth):
        # go through the DMV app proxy so this exercises the sample issuer app boundary.
        self.authenticate_app_session(browser_auth)
        offer_payload = self.offer_payload_builder(profile)
        response = self.session.post(
            f"{self.issuer_app_url}/credentials/offers",
            headers={"Content-Type": "application/json"},
            data=compact_json_body(offer_payload),
            timeout=30,
        )
        require_ok(response, f"Create credential offer through {self.app_name}")
        return response.json()

    @staticmethod
    def credential_offer_url(issuer_offer):
        if issuer_offer.get("credentialOfferUri"):
            return issuer_offer["credentialOfferUri"]

        credential_offer_payload = issuer_offer.get("credentialOfferPayload")
        if not credential_offer_payload:
            raise RuntimeError("The issuer offer did not include a credential offer URL or payload.")

        return "openid-credential-offer://?credential_offer=" + quote(
            json.dumps(credential_offer_payload, separators=(",", ":")),
            safe="",
        )


class WalletClient:
    def __init__(
        self,
        ca_bundle,
        holder_client_id=DEFAULT_HOLDER_CLIENT_ID,
        redirect_uri=DEFAULT_WALLET_REDIRECT_URI,
    ):
        self.holder_client_id = holder_client_id
        self.redirect_uri = redirect_uri
        self.ca_bundle = str(ca_bundle)
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.verify = self.ca_bundle
        self.session.headers.update({"Accept": "application/json"})
        self.holder_token_status = None
        self.credential_status = {}
        self.holder_debug = {}
        self.presentation_status = None
        self._credentials = {}
        self._latest_credential_key = None
        self._issued_credential = None
        self._private_key_pem = None

    @staticmethod
    def parse_credential_offer(credential_offer_url):
        # the wallet only receives the deep link, so unpack the embedded credential offer from that uri.
        credential_offer = parse_uri_query(credential_offer_url).get("credential_offer")
        if not credential_offer:
            raise RuntimeError("The credential offer URL did not include a credential_offer parameter.")
        return json.loads(credential_offer)

    @staticmethod
    def credential_configuration_id(credential_offer_payload):
        # this sample issues one credential type at a time, so the first configuration id is the one we redeem.
        credential_configuration_ids = credential_offer_payload.get("credential_configuration_ids") or []
        if not credential_configuration_ids:
            raise RuntimeError("The credential offer did not include any credential configuration ids.")
        return credential_configuration_ids[0]

    @staticmethod
    def build_authorization_details(credential_configuration_id, credential_issuer):
        return [
            {
                "type": "openid_credential",
                "credential_configuration_id": credential_configuration_id,
                "locations": [credential_issuer],
            }
        ]

    @staticmethod
    def generate_pkce_verifier():
        verifier = secrets.token_urlsafe(48)
        if len(verifier) < 43:
            verifier += "A" * (43 - len(verifier))
        return verifier

    @staticmethod
    def pkce_s256_challenge(verifier):
        return base64url_encode(hashlib.sha256(verifier.encode("ascii")).digest())

    @staticmethod
    def generate_wallet_keypair():
        # the wallet needs its own ephemeral keypair because both the proof jwt and the mdoc presentation
        # must be signed as the holder rather than reused from the issuer.
        private_key = ec.generate_private_key(ec.SECP256R1())
        public_numbers = private_key.public_key().public_numbers()
        public_jwk = {
            "kty": "EC",
            "crv": "P-256",
            "x": base64url_encode(public_numbers.x.to_bytes(32, "big")),
            "y": base64url_encode(public_numbers.y.to_bytes(32, "big")),
        }
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        return private_key, public_jwk, private_pem

    @staticmethod
    def build_key_binding_proof(private_key, public_jwk, issuer, nonce, client_id):
        header = {
            "alg": "ES256",
            "typ": "openid4vci-proof+jwt",
            "jwk": public_jwk,
        }
        payload = {
            "iss": client_id,
            "aud": issuer,
            "iat": int(time.time()),
            "nonce": nonce,
            "jti": str(uuid.uuid4()),
        }

        encoded_header = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        encoded_payload = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        der_signature = private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        r_value, s_value = decode_dss_signature(der_signature)
        raw_signature = r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big")
        return f"{encoded_header}.{encoded_payload}.{base64url_encode(raw_signature)}"

    def authorize_wallet(self, credential_offer_payload, credential_configuration_id, redirect_uri, code_verifier, browser_auth):
        # The holder needs an actual OAuth browser session, not a resource-owner-password grant.
        credential_issuer = credential_offer_payload["credential_issuer"]
        authorization_server = credential_offer_payload["grants"]["authorization_code"]["authorization_server"]
        wallet_client_id = credential_offer_payload["grants"]["authorization_code"]["client_id"]
        issuer_state = credential_offer_payload["grants"]["authorization_code"]["issuer_state"]

        authorize_url = (
            f"{authorization_server}/authorize?"
            + requests.compat.urlencode(
                {
                    "client_id": wallet_client_id,
                    "response_type": "code",
                    "redirect_uri": redirect_uri,
                    "code_challenge": self.pkce_s256_challenge(code_verifier),
                    "code_challenge_method": "S256",
                    "authorization_details": json.dumps(
                        self.build_authorization_details(credential_configuration_id, credential_issuer),
                        separators=(",", ":"),
                    ),
                    "issuer_state": issuer_state,
                }
            )
        )

        callback_url = browser_auth.complete_wallet_authorization(authorize_url, self.session)
        return {
            "authorization_server": authorization_server,
            "credential_issuer": credential_issuer,
            "wallet_client_id": wallet_client_id,
            "redirect_uri": redirect_uri,
            "authorization_code": authorization_code_from_callback(callback_url),
            "state": parse_uri_query(callback_url).get("state", ""),
            "authentication": "playwright_browser",
        }

    def exchange_wallet_code(self, authorization_server, wallet_client_id, authorization_code, redirect_uri, code_verifier):
        # once we have the authorization code, we trade it for the wallet access token just like a normal client.
        token_url = f"{authorization_server}/token"
        response = self.session.post(
            token_url,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code",
                "client_id": wallet_client_id,
                "code": authorization_code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            timeout=30,
        )
        require_ok(response, f"Exchange wallet authorization code at {token_url}")
        return response.json()

    def fetch_credential_issuer_metadata(self, credential_issuer):
        # the issuer metadata tells us where to ask for a nonce and where to ask for the credential itself.
        metadata_url = f"{credential_issuer.rstrip('/')}/.well-known/openid-credential-issuer"
        response = self.session.get(metadata_url, timeout=30)
        require_ok(response, f"Fetch credential issuer metadata from {metadata_url}")
        return response.json()

    def fetch_issuer_nonce(self, nonce_endpoint, access_token):
        # the issuer nonce is fed into the proof jwt so the issuance request is fresh and replay resistant.
        response = self.session.post(
            nonce_endpoint,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
            json={},
            timeout=30,
        )
        require_ok(response, f"Fetch issuer nonce from {nonce_endpoint}")
        return response.json()

    def issue_credential(self, credential_endpoint, access_token, credential_configuration_id, proof_jwt):
        # this is the moment the holder actually receives the credential,
        # after proving possession of the wallet key through the jwt proof.
        response = self.session.post(
            credential_endpoint,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
            json={
                "credential_configuration_id": credential_configuration_id,
                "proofs": {
                    "jwt": [proof_jwt],
                },
            },
            timeout=30,
        )
        require_ok(response, f"Issue credential at {credential_endpoint}")
        return response.json()

    @staticmethod
    def cbor_tag24(value):
        return cbor2.CBORTag(24, cbor2.dumps(value, canonical=True))

    @staticmethod
    def parse_dcql_query(dcql_query):
        if isinstance(dcql_query, str):
            return json.loads(dcql_query)
        if isinstance(dcql_query, dict):
            return dcql_query
        raise RuntimeError("The verifier wallet engagement did not include a usable DCQL query.")

    @staticmethod
    def first_requested_mdoc(dcql_query):
        credentials = dcql_query.get("credentials", [])
        if not credentials:
            raise RuntimeError("The verifier DCQL query did not request any credentials.")

        requested_credential = credentials[0]
        if requested_credential.get("format") != "mso_mdoc":
            raise RuntimeError("The verifier DCQL query did not request an mso_mdoc credential.")

        credential_id = requested_credential.get("id")
        doc_type = requested_credential.get("meta", {}).get("doctype_value")
        if not credential_id or not doc_type:
            raise RuntimeError("The verifier DCQL query is missing the credential id or mdoc docType.")

        requested_claims = {}
        for claim in requested_credential.get("claims") or []:
            path = claim.get("path") or []
            if len(path) != 2 or not all(isinstance(component, str) for component in path):
                raise RuntimeError(f"The verifier DCQL query contains an unsupported mdoc claim path: {path!r}")
            requested_claims.setdefault(path[0], set()).add(path[1])

        return credential_id, doc_type, requested_claims

    @staticmethod
    def parse_issuer_signed_credential(issued_credential):
        # dc-agency gives us the mdoc as a base64url-encoded issuerSigned blob,
        # so decode it back into the cbor structure before we wrap it in a device response.
        issuer_signed_bytes = base64url_decode(issued_credential)
        issuer_signed = cbor2.loads(issuer_signed_bytes)
        if not isinstance(issuer_signed, dict) or "nameSpaces" not in issuer_signed or "issuerAuth" not in issuer_signed:
            raise RuntimeError("The issued DMV credential was not an issuerSigned mso_mdoc structure.")
        return issuer_signed

    @staticmethod
    def selectively_disclose_issuer_signed(issuer_signed, requested_claims):
        """Return IssuerSigned with only the namespace elements selected by DCQL."""
        if not requested_claims:
            return issuer_signed

        disclosed_namespaces = {}
        for namespace, element_bytes_list in issuer_signed.get("nameSpaces", {}).items():
            requested_elements = requested_claims.get(namespace)
            if not requested_elements:
                continue

            disclosed_elements = []
            for element_bytes in element_bytes_list:
                if not isinstance(element_bytes, cbor2.CBORTag) or element_bytes.tag != 24:
                    raise RuntimeError("The issued mdoc contains an invalid IssuerSignedItemBytes value.")
                issuer_signed_item = cbor2.loads(element_bytes.value)
                element_identifier = issuer_signed_item.get("elementIdentifier")
                if element_identifier in requested_elements:
                    disclosed_elements.append(element_bytes)

            missing_elements = requested_elements - {
                cbor2.loads(element.value).get("elementIdentifier") for element in disclosed_elements
            }
            if missing_elements:
                raise RuntimeError(
                    f"The issued mdoc does not contain requested claims in {namespace}: {sorted(missing_elements)}"
                )
            disclosed_namespaces[namespace] = disclosed_elements

        missing_namespaces = set(requested_claims) - set(disclosed_namespaces)
        if missing_namespaces:
            raise RuntimeError(f"The issued mdoc does not contain requested namespaces: {sorted(missing_namespaces)}")

        return {
            "nameSpaces": disclosed_namespaces,
            "issuerAuth": issuer_signed["issuerAuth"],
        }

    @staticmethod
    def jwk_sha256_thumbprint(jwk_dict):
        """Compute the JWK SHA-256 Thumbprint (RFC 7638) for an EC public key.

        For EC keys the required members in lexicographic order are: crv, kty, x, y.
        Returns raw bytes (32 bytes for SHA-256).
        """
        required = {k: jwk_dict[k] for k in ("crv", "kty", "x", "y")}
        thumbprint_json = json.dumps(required, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(thumbprint_json.encode("ascii")).digest()

    @staticmethod
    def build_openid4vp_handover(client_id, nonce, response_uri, jwk_thumbprint_bytes=None):
        # Per OID4VP B.2.6.1: OpenID4VPHandoverInfo = [client_id, nonce, jwkThumbprint, response_uri]
        # jwkThumbprint is the SHA-256 JWK thumbprint (RFC 7638) of the verifier's enc key as a bstr,
        # or null when the response is not encrypted (legacy direct_post flow).
        handover_info = [client_id, nonce, jwk_thumbprint_bytes, response_uri]
        handover_hash = hashlib.sha256(cbor2.dumps(handover_info, canonical=True)).digest()
        return ["OpenID4VPHandover", handover_hash]

    def build_session_transcript(self, client_id, nonce, response_uri, jwk_thumbprint_bytes=None):
        return [None, None, self.build_openid4vp_handover(client_id, nonce, response_uri, jwk_thumbprint_bytes)]

    @staticmethod
    def load_wallet_private_key(private_key_pem):
        return serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)

    def build_cose_signing_key(self, private_key_pem):
        private_key = self.load_wallet_private_key(private_key_pem)
        private_numbers = private_key.private_numbers()
        public_numbers = private_numbers.public_numbers
        return CoseKey.from_dict(
            {
                KpKty: KtyEC2,
                KpAlg: Es256,
                EC2KpCurve: P256,
                EC2KpX: public_numbers.x.to_bytes(32, "big"),
                EC2KpY: public_numbers.y.to_bytes(32, "big"),
                EC2KpD: private_numbers.private_value.to_bytes(32, "big"),
            }
        )

    def build_device_authentication_bytes(self, client_id, nonce, response_uri, doc_type, device_namespaces_tag24, jwk_thumbprint_bytes=None):
        device_authentication = [
            "DeviceAuthentication",
            self.build_session_transcript(client_id, nonce, response_uri, jwk_thumbprint_bytes),
            doc_type,
            device_namespaces_tag24,
        ]
        return cbor2.dumps(cbor2.CBORTag(24, cbor2.dumps(device_authentication, canonical=True)), canonical=True)

    def build_device_signature(self, private_key_pem, client_id, nonce, response_uri, doc_type, device_namespaces_tag24, jwk_thumbprint_bytes=None):
        device_authentication_bytes = self.build_device_authentication_bytes(
            client_id,
            nonce,
            response_uri,
            doc_type,
            device_namespaces_tag24,
            jwk_thumbprint_bytes,
        )
        message = Sign1Message(
            phdr={Algorithm: Es256},
            payload=None,
        )
        message.key = self.build_cose_signing_key(private_key_pem)
        # ISO mdoc signs DeviceAuthentication as COSE external AAD. The Sign1
        # payload is null; embedding those bytes as the payload yields a valid
        # COSE signature but an invalid mdoc device authentication structure.
        return cbor2.loads(message.encode(tag=False, detached_payload=device_authentication_bytes))

    def build_mdoc_device_response(self, issued_credential, private_key_pem, wallet_engagement_params):
        # this assembles the exact vp_token shape the verifier expects:
        # the issuer-signed mdoc plus the holder's device signature over the session transcript.
        client_id = wallet_engagement_params.get("client_id")
        nonce = wallet_engagement_params.get("nonce")
        response_uri = wallet_engagement_params.get("response_uri")
        if not client_id or not nonce or not response_uri:
            raise RuntimeError("The verifier wallet engagement is missing the client_id, nonce, or response_uri needed for deviceAuth.")

        dcql_query = self.parse_dcql_query(wallet_engagement_params.get("dcql_query"))
        credential_id, doc_type, requested_claims = self.first_requested_mdoc(dcql_query)
        issuer_signed = self.selectively_disclose_issuer_signed(
            self.parse_issuer_signed_credential(issued_credential),
            requested_claims,
        )
        device_namespaces_tag24 = self.cbor_tag24({})
        verifier_enc_jwk = wallet_engagement_params.get("verifier_enc_jwk")
        jwk_thumbprint_bytes = self.jwk_sha256_thumbprint(verifier_enc_jwk) if verifier_enc_jwk else None
        device_signature = self.build_device_signature(
            private_key_pem,
            client_id,
            nonce,
            response_uri,
            doc_type,
            device_namespaces_tag24,
            jwk_thumbprint_bytes,
        )

        device_response = {
            "version": "1.0",
            "documents": [
                {
                    "docType": doc_type,
                    "issuerSigned": issuer_signed,
                    "deviceSigned": {
                        "nameSpaces": device_namespaces_tag24,
                        "deviceAuth": {
                            "deviceSignature": device_signature,
                        },
                    },
                }
            ],
            "status": 0,
        }
        return {
            credential_id: [base64url_encode(cbor2.dumps(device_response, canonical=True))],
        }

    def obtain_credential(self, credential_key, credential_offer_url, browser_auth):
        # wallet entry point 1: the only input is what the DMV QR/deep link gives the mobile wallet.
        self.holder_token_status = {
            "authenticated": True,
            "client_id": self.holder_client_id,
            "method": "browser_authorization_code",
        }

        credential_offer_payload = self.parse_credential_offer(credential_offer_url)
        credential_configuration_id = self.credential_configuration_id(credential_offer_payload)
        code_verifier = self.generate_pkce_verifier()
        wallet_authorization = self.authorize_wallet(
            credential_offer_payload,
            credential_configuration_id,
            self.redirect_uri,
            code_verifier,
            browser_auth,
        )
        wallet_token = self.exchange_wallet_code(
            wallet_authorization["authorization_server"],
            wallet_authorization["wallet_client_id"],
            wallet_authorization["authorization_code"],
            wallet_authorization["redirect_uri"],
            code_verifier,
        )
        issuer_metadata = self.fetch_credential_issuer_metadata(wallet_authorization["credential_issuer"])
        nonce_payload = self.fetch_issuer_nonce(issuer_metadata["nonce_endpoint"], wallet_token["access_token"])

        private_key, public_jwk, private_key_pem = self.generate_wallet_keypair()
        proof_jwt = self.build_key_binding_proof(
            private_key,
            public_jwk,
            wallet_authorization["credential_issuer"],
            nonce_payload["c_nonce"],
            wallet_authorization["wallet_client_id"],
        )
        issued_credential = self.issue_credential(
            issuer_metadata["credential_endpoint"],
            wallet_token["access_token"],
            credential_configuration_id,
            proof_jwt,
        )

        stored_credential = StoredCredential(
            issued_credential=issued_credential["credentials"][0]["credential"],
            private_key_pem=private_key_pem,
            issued_response=issued_credential,
        )
        self._credentials[credential_key] = stored_credential
        self._latest_credential_key = credential_key
        self._issued_credential = stored_credential.issued_credential
        self._private_key_pem = stored_credential.private_key_pem

        self.holder_debug[credential_key] = {
            "wallet_authorization": summarise_wallet_authorization(wallet_authorization),
            "wallet_token": {
                "token_type": wallet_token.get("token_type"),
                "expires_in": wallet_token.get("expires_in"),
                "authorization_details": wallet_token.get("authorization_details"),
                "c_nonce": wallet_token.get("c_nonce"),
                "c_nonce_expires_in": wallet_token.get("c_nonce_expires_in"),
            },
            "issuer_metadata": issuer_metadata,
            "nonce_payload": nonce_payload,
            "wallet_public_jwk": public_jwk,
        }
        self.credential_status[credential_key] = {
            "completed": True,
            "message": "The credential offer was redeemed directly through the OID4VCI authorization-code flow.",
            "credential_key": credential_key,
            "wallet_client_id": wallet_authorization["wallet_client_id"],
            "issued_credential": issued_credential,
        }
        return issued_credential

    def get_stored_credential(self, credential_key=None):
        selected_credential_key = credential_key or self._latest_credential_key
        if not selected_credential_key or selected_credential_key not in self._credentials:
            raise RuntimeError("The wallet must obtain a credential before it can present one.")

        return selected_credential_key, self._credentials[selected_credential_key]

    @staticmethod
    def generate_enc_keypair():
        """Generate an ephemeral P-256 JWK pair used to receive the encrypted JAR response."""
        private_key = jw_jwk.JWK.generate(kty="EC", crv="P-256", use="enc")
        private_jwk = json.loads(private_key.export(private_key=True))
        public_jwk = json.loads(private_key.export(private_key=False))
        private_jwk["kid"] = "walletkey_P-256-enc"
        public_jwk["kid"] = "walletkey_P-256-enc"
        return private_jwk, public_jwk

    def _fetch_verifier_root_cert_pem(self, jar_uri):
        """Fetch the verifier agent's root CA certificate from the public trust anchor JWKS endpoint.

        The jar_uri path contains the agent ID:
          .../jar/<agent_id>/...
        The public JWKS endpoint (no auth required) is:
          <agency_base>/diagency/v1.0/diagency/trust/anchor/<agent_id>/.well-known/jwks.json
        and returns a standard JWKS document whose keys carry an x5c array of base64-encoded DER certs.
        x5c[0] is the leaf/root cert; we decode it as DER and convert to PEM.
        """
        from cryptography.hazmat.primitives.serialization import Encoding

        # Extract agent_id: the segment after "jar/" in the path.
        parsed = urlparse(jar_uri)
        path_parts = parsed.path.split("/")
        try:
            jar_idx = path_parts.index("jar")
            agent_id = path_parts[jar_idx + 1]
        except (ValueError, IndexError):
            raise RuntimeError(f"Cannot parse agent_id from JAR URI path: {parsed.path!r}")

        # path looks like /diagency/v1.0/oidvc/vp/exchange/public/jar/<agent_id>/...
        # The trust anchor base is scheme://host[:port]/diagency/v1.0/diagency
        agency_base = f"{parsed.scheme}://{parsed.netloc}"
        jwks_url = f"{agency_base}/diagency/v1.0/diagency/trust/anchor/{agent_id}/.well-known/jwks.json"

        print(f"[bypassqr] Fetching verifier root cert JWKS from: {jwks_url}")
        response = self.session.get(jwks_url, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(
                f"Trust anchor JWKS endpoint returned {response.status_code} for agent {agent_id}: {response.text[:200]}"
            )
        jwks = response.json()
        keys = jwks.get("keys", [])

        # Find the first key that has an x5c array — that's the root of trust certificate.
        x5c_b64 = None
        for key in keys:
            x5c = key.get("x5c")
            if x5c and len(x5c) > 0:
                x5c_b64 = x5c[0]
                break
        if not x5c_b64:
            raise RuntimeError(
                f"Trust anchor JWKS for agent {agent_id} did not include any key with an x5c certificate."
            )

        # x5c values are base64-encoded DER (not base64url, not PEM).
        from cryptography import x509 as _x509
        root_der = base64.b64decode(x5c_b64)
        root_cert = _x509.load_der_x509_certificate(root_der)
        root_cert_pem = root_cert.public_bytes(Encoding.PEM).decode("utf-8")
        print(f"[bypassqr] Retrieved verifier root cert: subject={root_cert.subject!r}")
        return root_cert_pem

    @staticmethod
    def _verify_jar_jwt_x5c(signed_jwt_compact, root_cert_pem):
        """Verify the JAR JWT's x5c chain against the known verifier root cert and return the payload dict.

        Steps (matching the autotest's verify_jwt_x5c_and_alg):
          1. Decode the JWT header to extract the x5c cert chain.
          2. Load the leaf cert (x5c[0]) and verify its signature with the root cert's public key.
          3. Verify the JWT signature with the leaf cert's public key.
          4. Return the decoded payload.
        """
        from cryptography import x509
        from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
        from cryptography.exceptions import InvalidSignature

        parts = signed_jwt_compact.split(".")
        if len(parts) != 3:
            raise RuntimeError("JAR response is not a compact JWS (expected 3 dot-separated parts).")

        def _b64url_decode(s):
            padding = (4 - len(s) % 4) % 4
            return base64.urlsafe_b64decode(s + "=" * padding)

        header = json.loads(_b64url_decode(parts[0]))
        payload_bytes = _b64url_decode(parts[1])

        print(f"[bypassqr] JAR JWT header alg={header.get('alg')!r} typ={header.get('typ')!r}, "
              f"x5c chain length={len(header.get('x5c', []))}")

        x5c_chain = header.get("x5c")
        if not x5c_chain:
            raise RuntimeError("JAR JWT header does not contain an x5c certificate chain.")
        if header.get("alg") != "ES256":
            raise RuntimeError(f"JAR JWT uses unexpected alg {header.get('alg')!r}; expected ES256.")

        # Load the leaf cert from x5c[0] (base64-encoded DER, no PEM armour).
        leaf_der = base64.b64decode(x5c_chain[0])
        leaf_cert = x509.load_der_x509_certificate(leaf_der)

        # Load the root cert from the trust anchor (PEM).
        root_cert = x509.load_pem_x509_certificate(root_cert_pem.encode("utf-8"))

        # Verify leaf cert is signed by the root.
        try:
            root_cert.public_key().verify(
                leaf_cert.signature,
                leaf_cert.tbs_certificate_bytes,
                ECDSA(leaf_cert.signature_hash_algorithm),
            )
            print("[bypassqr] Leaf cert signature verified against verifier root cert — OK")
        except InvalidSignature:
            raise RuntimeError("JAR JWT leaf certificate was NOT signed by the known verifier root CA.")

        # Verify the JWT signature using the leaf cert's public key.
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        raw_signature = _b64url_decode(parts[2])
        # JWT ES256 signature is raw (r || s), 64 bytes. cryptography needs DER.
        r = int.from_bytes(raw_signature[:32], "big")
        s = int.from_bytes(raw_signature[32:], "big")
        der_signature = encode_dss_signature(r, s)
        try:
            leaf_cert.public_key().verify(der_signature, signing_input, ECDSA(hashes.SHA256()))
            print("[bypassqr] JAR JWT signature verified against leaf cert public key — OK")
        except InvalidSignature:
            raise RuntimeError("JAR JWT signature verification failed against the leaf certificate public key.")

        return json.loads(payload_bytes)

    def fetch_jar_request(self, jar_uri, wallet_engagement_params):
        """POST wallet_metadata to the JAR endpoint, decrypt the JWE, verify the x5c JWT, return the payload."""
        private_enc_jwk, public_enc_jwk = self.generate_enc_keypair()

        # Fetch the verifier's root CA cert from the public trust anchor endpoint.
        root_cert_pem = self._fetch_verifier_root_cert_pem(jar_uri)

        # The JAR endpoint expects form-encoded wallet_metadata[jwks][keys][0][...] fields.
        form_data = {
            "wallet_metadata[vp_formats_supported][mso_mdoc][deviceauth_alg_values][0]": "-9",
            "wallet_metadata[vp_formats_supported][mso_mdoc][issuerauth_alg_values][0]": "-9",
            "wallet_metadata[jwks][keys][0][kty]": public_enc_jwk["kty"],
            "wallet_metadata[jwks][keys][0][crv]": public_enc_jwk["crv"],
            "wallet_metadata[jwks][keys][0][x]": public_enc_jwk["x"],
            "wallet_metadata[jwks][keys][0][y]": public_enc_jwk["y"],
            "wallet_metadata[jwks][keys][0][kid]": public_enc_jwk["kid"],
            "wallet_metadata[jwks][keys][0][use]": "enc",
        }
        print(f"[bypassqr] Posting wallet_metadata to JAR endpoint: {jar_uri}")
        response = self.session.post(
            jar_uri,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=form_data,
            timeout=30,
        )
        if response.status_code != 200:
            raise RuntimeError(f"JAR endpoint returned {response.status_code}: {response.text[:200]}")
        print(f"[bypassqr] JAR endpoint returned {response.status_code}, body length={len(response.text)}")

        # The server returns a JWE wrapping the signed request JWT.
        print("[bypassqr] Decrypting JWE response from JAR endpoint...")
        jwe_token = jw_jwe.JWE()
        jwe_token.deserialize(response.text.strip(), key=jw_jwk.JWK(**private_enc_jwk))
        signed_jwt_compact = jwe_token.payload.decode("utf-8")
        print(f"[bypassqr] Decrypted signed JWT compact length={len(signed_jwt_compact)}")

        # Verify the x5c chain and JWT signature, then return the payload.
        print("[bypassqr] Verifying JAR JWT x5c chain and signature...")
        payload = self._verify_jar_jwt_x5c(signed_jwt_compact, root_cert_pem)
        print(f"[bypassqr] JAR JWT verified. client_id={payload.get('client_id')!r} "
              f"nonce={payload.get('nonce')!r} response_uri={payload.get('response_uri')!r}")
        return payload

    @staticmethod
    def encrypt_vp_response(vp_token_payload, verifier_state, enc_public_jwk_dict):
        """Encrypt {state, vp_token} as a JWE for direct_post.jwt submission."""
        plaintext = json.dumps(
            {"state": verifier_state, "vp_token": vp_token_payload},
            separators=(",", ":"),
        ).encode("utf-8")
        verifier_key = jw_jwk.JWK(**enc_public_jwk_dict)
        protected = {"alg": "ECDH-ES", "enc": "A128GCM", "kid": enc_public_jwk_dict.get("kid", "")}
        jwe_token = jw_jwe.JWE(plaintext, protected=json.dumps(protected))
        jwe_token.add_recipient(verifier_key)
        return jwe_token.serialize(compact=True)

    def present_credential(self, wallet_engagement_url, credential_key=None):
        # wallet entry point 2: the only input is what the verifier QR/deep link gives the mobile wallet.
        selected_credential_key, stored_credential = self.get_stored_credential(credential_key)

        print(f"[bypassqr] present_credential: wallet_engagement_url={wallet_engagement_url!r}")
        wallet_engagement_params = parse_uri_query(wallet_engagement_url)
        request_uri = wallet_engagement_params.get("request_uri")
        print(f"[bypassqr] present_credential: request_uri={request_uri!r}, "
              f"client_id={wallet_engagement_params.get('client_id')!r}")

        if request_uri:
            # by_reference_jwt + direct_post.jwt flow:
            # 1. POST wallet metadata to the JAR endpoint to obtain the encrypted request object.
            # 2. Decrypt the JWE and verify the signed JWT (x5c chain + signature) to get the authorize_request.
            # 3. Build the mdoc device response using the verified params.
            # 4. Encrypt the VP response with the verifier's enc key and POST as "response=<JWE>".
            authorize_request = self.fetch_jar_request(request_uri, wallet_engagement_params)
            client_id = authorize_request.get("client_id")
            nonce = authorize_request.get("nonce")
            response_uri = authorize_request.get("response_uri")
            verifier_state = authorize_request.get("state")
            if not client_id or not nonce or not response_uri or not verifier_state:
                raise RuntimeError(
                    "The decrypted JAR request is missing client_id, nonce, response_uri, or state."
                )
            # Extract the verifier's encryption key from client_metadata.jwks.
            enc_keys = (
                authorize_request.get("client_metadata", {})
                .get("jwks", {})
                .get("keys", [])
            )
            verifier_enc_jwk = next(
                (k for k in enc_keys if k.get("use") == "enc"),
                None,
            )
            if not verifier_enc_jwk:
                raise RuntimeError("The JAR client_metadata did not include an enc key for response encryption.")
            # Merge all needed params so build_mdoc_device_response can find them.
            # verifier_enc_jwk is included so the handover JWK thumbprint can be computed.
            wallet_engagement_params = dict(wallet_engagement_params)
            wallet_engagement_params["client_id"] = client_id
            wallet_engagement_params["nonce"] = nonce
            wallet_engagement_params["response_uri"] = response_uri
            wallet_engagement_params["dcql_query"] = authorize_request.get("dcql_query")
            wallet_engagement_params["verifier_enc_jwk"] = verifier_enc_jwk
            vp_token_payload = self.build_mdoc_device_response(
                stored_credential.issued_credential,
                stored_credential.private_key_pem,
                wallet_engagement_params,
            )
            encrypted_response = self.encrypt_vp_response(vp_token_payload, verifier_state, verifier_enc_jwk)
            print(f"[bypassqr] Posting encrypted VP response to response_uri={response_uri!r}")
            response = self.session.post(
                response_uri,
                headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                data={"response": encrypted_response},
                timeout=30,
            )
        else:
            # Legacy by_value_params + direct_post flow: all params are inline in the engagement URL.
            response_uri = wallet_engagement_params.get("response_uri")
            verifier_state = wallet_engagement_params.get("state")
            if not response_uri or not verifier_state:
                raise RuntimeError(
                    "The verifier wallet engagement is missing the response_uri or state needed for direct_post submission."
                )
            vp_token_payload = self.build_mdoc_device_response(
                stored_credential.issued_credential,
                stored_credential.private_key_pem,
                wallet_engagement_params,
            )
            response = self.session.post(
                response_uri,
                headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                data={
                    "state": verifier_state,
                    "vp_token": json.dumps(vp_token_payload, separators=(",", ":")),
                },
                timeout=30,
            )

        print(f"[bypassqr] VP response POST status={response.status_code}")
        self.presentation_status = {
            "completed": False,
            "message": "Submitted a real mso_mdoc holder presentation to the verifier response_uri.",
            "credential_key": selected_credential_key,
            "presentation_submission": summarise_http_response(response),
            "verifier_response_uri": response_uri,
            "vp_token_payload": vp_token_payload,
        }
        return self.presentation_status


class VerifierClient:
    def __init__(self, verifier_app_url, ca_bundle):
        self.verifier_app_url = verifier_app_url.rstrip("/")
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.verify = str(ca_bundle)
        self.session.headers.update({"Accept": "application/json"})

    def start_verification_exchange(self, with_qr_code, purpose=BANK_SIGNUP_PURPOSE):
        # ask the verifier app to create a real exchange for us.
        # purpose is encoded in the URL path — no body parameters needed.
        response = self.session.post(
            f"{self.verifier_app_url}/credentials/verifiable/presentation/{purpose}",
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        require_ok(response, "Start verifier exchange")
        return response.json()

    def get_verification_exchange(self, purpose=BANK_SIGNUP_PURPOSE):
        # poll the verifier app for the current exchange state.
        # purpose is encoded in the URL path — no query parameters needed.
        response = self.session.get(
            f"{self.verifier_app_url}/credentials/verifiable/presentation/{purpose}",
            timeout=30,
        )
        require_ok(response, "Get verifier exchange")
        return response.json()

    def get_verification_attributes(self, purpose=BANK_SIGNUP_PURPOSE):
        # once the verifier succeeds, the app exposes the verified attributes through this helper route.
        # purpose is encoded in the URL path — no query parameters needed.
        response = self.session.get(
            f"{self.verifier_app_url}/credentials/verifiable/presentation/{purpose}/vc",
            timeout=30,
        )
        require_ok(response, "Get verifier attributes")
        return response.json()

    def create_bank_account(self, workflow_session, signup_payload):
        response = self.session.post(
            f"{self.verifier_app_url}/api/signup",
            headers={"Content-Type": "application/json"},
            data=compact_json_body(signup_payload),
            timeout=30,
        )
        response_summary = summarise_http_response(response)
        response_message = summarised_response_message(response_summary)

        if not response.ok and "IBM Verify signup is not configured. Missing:" in response_message:
            workflow_session.bank_signup_status = {
                **skipped_status("Skipped bank account creation because IBM Verify signup is not configured in this deployment."),
                "verifier_app_url": self.verifier_app_url,
                "signup_payload": signup_payload,
                "signup_response": response_summary,
            }
            workflow_session.notes.append(response_message)
            return None

        signup_response = response.json() if response.ok else None
        authentication_status = None
        if response.ok:
            status_response = self.session.get(
                f"{self.verifier_app_url}/auth/status",
                timeout=30,
            )
            require_ok(status_response, "Check authenticated Bank signup session")
            authentication_status = status_response.json()
            if not authentication_status.get("authenticated"):
                raise RuntimeError(
                    "The bank account was created, but signup did not establish an authenticated Bank session."
                )

        workflow_session.bank_signup_status = {
            "completed": response.ok,
            "message": "Created and authenticated a bank account through the bank app signup route."
            if response.ok
            else "The bank app signup route rejected the account creation request.",
            "verifier_app_url": self.verifier_app_url,
            "signup_payload": signup_payload,
            "signup_response": response_summary,
            "authentication_status": authentication_status,
        }
        require_ok(response, "Create bank account through bank app")
        return signup_response

    def poll_verification_status(self, workflow_session, purpose=BANK_SIGNUP_PURPOSE):
        # the verifier app keeps exchange state server-side,
        # so poll its helper route until it settles on success or error.
        latest_exchange = None
        for _ in range(DEFAULT_VERIFIER_STATUS_POLL_ATTEMPTS):
            latest_exchange = self.get_verification_exchange(purpose)
            record_verifier_exchange(workflow_session, latest_exchange, purpose)
            if latest_exchange.get("execution_state") in {"success", "error"}:
                return latest_exchange
            time.sleep(DEFAULT_VERIFIER_STATUS_POLL_INTERVAL_SECONDS)

        return latest_exchange

    def fetch_verification_attributes(self, workflow_session, purpose=BANK_SIGNUP_PURPOSE):
        verification_attributes = self.get_verification_attributes(purpose)
        workflow_session.verification_status = {
            "completed": True,
            "message": "The verification completed through the real verifier app flow.",
            "verifier_app_url": self.verifier_app_url,
            "exchange": workflow_session.verifier_exchange,
            "attributes": verification_attributes.get("attributes"),
        }
        workflow_session.verification_statuses[purpose] = workflow_session.verification_status
        return verification_attributes

    def finalise_verification_result(self, workflow_session, latest_exchange, purpose=BANK_SIGNUP_PURPOSE):
        # once the exchange stops moving, either fetch the decoded attributes
        # or capture the failed exchange snapshot for the saved session artifact.
        if latest_exchange and latest_exchange.get("execution_state") == "success":
            return self.fetch_verification_attributes(workflow_session, purpose)

        presentation_status = workflow_session.verification_statuses.get(purpose, workflow_session.verification_status)
        workflow_session.verification_status = {
            "completed": False,
            "message": "The verifier rejected or did not complete the submitted mso_mdoc holder presentation.",
            "verifier_app_url": self.verifier_app_url,
            "exchange": latest_exchange,
            "presentation": presentation_status,
            "verifier_response_uri": workflow_session.verifier_exchange.get("verifier_response_uri") if workflow_session.verifier_exchange else None,
            "wallet_engagement": workflow_session.verifier_exchange.get("wallet_engagement") if workflow_session.verifier_exchange else None,
        }
        workflow_session.verification_statuses[purpose] = workflow_session.verification_status
        return latest_exchange


def create_workflow_session(env_values):
    # start a fresh session object with the core environment settings and a couple of notes,
    # so even a failed run leaves behind a readable artifact in holder-session.json.
    return WorkflowSession(
        started_at=utc_now(),
        agency_url=env_values["REACT_APP_ACCOUNT_URL"],
        issuer_app_url=env_values["DMV_URL"],
        verifier_app_url=env_values["BANK_URL"],
        dmv_profile={
            **DMV_PROFILE,
            "credential_definition_id": env_values["CREDENTIAL_DEFINITION_ID"],
        },
        hr_app_url=env_values["HR_URL"],
        hr_profile={
            **HR_EMPLOYMENT_PROFILE,
            "credential_definition_id": env_values["HR_CREDENTIAL_DEFINITION_ID"],
        },
        notes=[
            "This script creates issuer and verifier exchanges through the sample app proxy routes, then acts as the holder wallet for the QR handoffs.",
            "The DMV UI QR code represents a credential offer, not an already-issued holder credential.",
            "Cloud Directory supplies the OAuth identity; the DMV demo profile supplies the licence claims for the issued mDL.",
            "The HR demo profile supplies employment claims because Cloud Directory OAuth claims do not contain the employment credential payload.",
            "The bank loan form has no submission API; its final submit action is a client-side applicationSubmitted state transition.",
        ],
    )


def build_issuer_flows(workflow_session):
    issuer_flows = {
        "dmv": IssuerFlowConfig(
            key="dmv",
            app_name="DMV app",
            issuer_app_url=workflow_session.issuer_app_url,
            profile=workflow_session.dmv_profile,
            offer_payload_builder=map_dmv_offer_payload,
        )
    }
    issuer_flows["hr"] = IssuerFlowConfig(
        key="hr",
        app_name="HR portal",
        issuer_app_url=workflow_session.hr_app_url,
        profile=workflow_session.hr_profile,
        offer_payload_builder=map_hr_offer_payload,
    )
    return issuer_flows


def summarise_issuer_offer(issuer_offer):
    return {
        "id": issuer_offer["id"],
        "state": issuer_offer.get("state"),
        "credential_offer_payload": issuer_offer.get("credentialOfferPayload"),
        "credential_offer_uri": IssuerClient.credential_offer_url(issuer_offer),
    }


def summarise_issuer_offer_uri(credential_offer_uri):
    credential_offer_payload = WalletClient.parse_credential_offer(credential_offer_uri)
    authorization_grant = credential_offer_payload.get("grants", {}).get("authorization_code", {})
    return {
        "id": authorization_grant.get("issuer_state"),
        "state": "OfferCreated",
        "credential_offer_payload": credential_offer_payload,
        "credential_offer_uri": credential_offer_uri,
    }


def store_wallet_credential_status(workflow_session, wallet_client, credential_key):
    workflow_session.holder_credential_statuses[credential_key] = wallet_client.credential_status[credential_key]
    workflow_session.holder_token_status = wallet_client.holder_token_status
    if credential_key == "dmv":
        workflow_session.holder_credential_status = workflow_session.holder_credential_statuses[credential_key]
    workflow_session.holder_debug = wallet_client.holder_debug


def present_and_finalise(
    workflow_session,
    wallet_client,
    verifier_client,
    credential_key,
    purpose,
    failure_message,
):
    wallet_client.present_credential(
        workflow_session.verifier_exchange["wallet_engagement"],
        credential_key=credential_key,
    )
    workflow_session.verification_status = {
        **wallet_client.presentation_status,
        "verifier_app_url": verifier_client.verifier_app_url,
    }
    workflow_session.verification_statuses[purpose] = workflow_session.verification_status

    latest_exchange = verifier_client.poll_verification_status(workflow_session, purpose=purpose)
    verification_result = verifier_client.finalise_verification_result(
        workflow_session,
        latest_exchange,
        purpose=purpose,
    )
    verification_status = workflow_session.verification_statuses.get(purpose)
    if not verification_status or not verification_status.get("completed"):
        raise RuntimeError(failure_message)
    return verification_result


def run_api_workflow(
    arguments,
    browser_auth,
    workflow_session,
    issuer_flows,
    issuer_clients,
    wallet_client,
    verifier_client,
):
    dmv_flow = issuer_flows["dmv"]
    dmv_offer = issuer_clients["dmv"].create_credential_offer(dmv_flow.profile, browser_auth)
    workflow_session.issuer_offer = summarise_issuer_offer(dmv_offer)
    workflow_session.issuer_offers["dmv"] = workflow_session.issuer_offer
    wallet_client.obtain_credential("dmv", workflow_session.issuer_offer["credential_offer_uri"], browser_auth)
    store_wallet_credential_status(workflow_session, wallet_client, "dmv")
    mark_step_completed(workflow_session, "dmv_credential_issued")

    hr_flow = issuer_flows["hr"]
    hr_offer = issuer_clients["hr"].create_credential_offer(hr_flow.profile, browser_auth)
    workflow_session.issuer_offers["hr"] = summarise_issuer_offer(hr_offer)
    wallet_client.obtain_credential(
        "hr",
        workflow_session.issuer_offers["hr"]["credential_offer_uri"],
        browser_auth,
    )
    store_wallet_credential_status(workflow_session, wallet_client, "hr")
    mark_step_completed(workflow_session, "hr_credential_issued")

    verifier_exchange = verifier_client.start_verification_exchange(
        DEFAULT_WITH_QR_CODE,
        purpose=BANK_SIGNUP_PURPOSE,
    )
    record_verifier_exchange(workflow_session, verifier_exchange, BANK_SIGNUP_PURPOSE)
    mark_step_completed(workflow_session, "bank_verification_exchange_created")

    verification_result = present_and_finalise(
        workflow_session,
        wallet_client,
        verifier_client,
        credential_key="dmv",
        purpose=BANK_SIGNUP_PURPOSE,
        failure_message="The bank verification did not complete successfully, so the bypass flow stopped before bank signup.",
    )
    mark_step_completed(workflow_session, "bank_verification_completed")

    bank_signup_payload = build_bank_signup_payload(
        verification_result.get("attributes") if isinstance(verification_result, dict) else None,
        arguments.bank_email,
    )
    verifier_client.create_bank_account(workflow_session, bank_signup_payload)
    if workflow_session.bank_signup_status and workflow_session.bank_signup_status.get("completed"):
        mark_step_completed(workflow_session, "bank_signup_completed")

    employment_exchange = verifier_client.start_verification_exchange(
        DEFAULT_WITH_QR_CODE,
        purpose=BANK_EMPLOYMENT_PURPOSE,
    )
    record_verifier_exchange(workflow_session, employment_exchange, BANK_EMPLOYMENT_PURPOSE)
    mark_step_completed(workflow_session, "employment_verification_exchange_created")

    employment_verification_result = present_and_finalise(
        workflow_session,
        wallet_client,
        verifier_client,
        credential_key="hr",
        purpose=BANK_EMPLOYMENT_PURPOSE,
        failure_message=(
            "The employment verification did not complete successfully, "
            "so the bypass flow stopped before loan application."
        ),
    )
    mark_step_completed(workflow_session, "employment_verification_completed")

    loan_application_payload = build_loan_application_payload(
        employment_verification_result.get("attributes")
        if isinstance(employment_verification_result, dict)
        else None
    )
    submit_loan_application(workflow_session, loan_application_payload)
    mark_step_completed(workflow_session, "loan_application_submitted")


def run_visual_workflow(
    arguments,
    browser_auth,
    workflow_session,
    wallet_client,
    verifier_client,
):
    visual = VisualFlowClient(browser_auth, step_delay_seconds=arguments.visual_step_delay)

    dmv_page = visual.authenticate_app("dmv", workflow_session.issuer_app_url, "/profile")
    visual.wait_for_visible(
        dmv_page,
        dmv_page.get_by_text("Manage your DMV services and digital credentials", exact=True),
        "the DMV profile",
    )
    visual.show(dmv_page, "DMV profile loaded after OAuth login.")
    dmv_offer_uri = visual.credential_offer_uri(dmv_page, "Add to digital wallet")
    workflow_session.issuer_offer = summarise_issuer_offer_uri(dmv_offer_uri)
    workflow_session.issuer_offers["dmv"] = workflow_session.issuer_offer
    visual.show(dmv_page, "DMV credential offer displayed for the wallet.")
    wallet_client.obtain_credential("dmv", dmv_offer_uri, browser_auth)
    store_wallet_credential_status(workflow_session, wallet_client, "dmv")
    mark_step_completed(workflow_session, "dmv_credential_issued")
    dmv_page.get_by_text("successfully been added to your wallet", exact=False).wait_for(
        state="visible", timeout=30_000
    )
    visual.show(dmv_page, "DMV confirmed that the credential was added to the wallet.")

    hr_page = visual.authenticate_app("hr", workflow_session.hr_app_url, "/portal")
    hr_page.get_by_text("Proof of Employment", exact=True).wait_for(state="visible", timeout=30_000)
    visual.show(hr_page, "HR portal loaded the signed-in employee profile.")
    hr_offer_uri = visual.credential_offer_uri(hr_page, "Issue to Wallet")
    workflow_session.issuer_offers["hr"] = summarise_issuer_offer_uri(hr_offer_uri)
    visual.show(hr_page, "HR displayed the employment credential offer.")
    wallet_client.obtain_credential("hr", hr_offer_uri, browser_auth)
    store_wallet_credential_status(workflow_session, wallet_client, "hr")
    mark_step_completed(workflow_session, "hr_credential_issued")
    hr_page.get_by_text("employment credential has been added to the wallet", exact=False).wait_for(
        state="visible", timeout=30_000
    )
    visual.show(hr_page, "HR confirmed that the employment credential was added.")

    bank_context = visual.context_for("bank")
    bank_page = bank_context.new_page()
    bank_page.goto(
        f"{workflow_session.verifier_app_url.rstrip('/')}/signup",
        wait_until="domcontentloaded",
        timeout=30_000,
    )
    visual.pages["bank"] = bank_page
    bank_page.get_by_text("Identity Verification", exact=True).first.wait_for(state="visible", timeout=30_000)
    visual.show(bank_page, "Bank signup opened at identity verification.")
    signup_wallet_engagement = visual.verifier_wallet_engagement(
        bank_page,
        "Scan Digital Driver's License",
    )
    record_verifier_exchange(
        workflow_session,
        {
            "id": parse_uri_query(signup_wallet_engagement).get("state"),
            "execution_state": "pending",
            "wallet_engagement": signup_wallet_engagement,
            "qr": None,
        },
        BANK_SIGNUP_PURPOSE,
    )
    mark_step_completed(workflow_session, "bank_verification_exchange_created")
    visual.copy_cookies_to("bank", verifier_client.session)
    visual.show(bank_page, "Bank displayed the driver's licence verification QR code.")
    signup_verification_result = present_and_finalise(
        workflow_session,
        wallet_client,
        verifier_client,
        credential_key="dmv",
        purpose=BANK_SIGNUP_PURPOSE,
        failure_message="The visual bank verification did not complete successfully.",
    )
    mark_step_completed(workflow_session, "bank_verification_completed")
    bank_page.get_by_role("button", name="Next: Account Details", exact=True).wait_for(
        state="visible", timeout=30_000
    )
    visual.show(bank_page, "Bank verified the mDL and pre-filled personal information.")
    bank_page.get_by_role("button", name="Next: Account Details", exact=True).click()
    bank_page.locator("#email").fill(arguments.bank_email)
    bank_page.locator("#phone").fill(DEFAULT_LOAN_APPLICATION["phone"])
    visual.show(bank_page, "Bank account details completed and ready to submit.")
    with bank_page.expect_response(
        lambda response: response.url.endswith("/api/signup") and response.request.method == "POST",
        timeout=30_000,
    ) as signup_response_info:
        bank_page.get_by_role("button", name="Complete Application", exact=True).click()
    signup_response = signup_response_info.value
    signup_response_body = signup_response.json()
    signup_payload = build_bank_signup_payload(
        signup_verification_result.get("attributes")
        if isinstance(signup_verification_result, dict)
        else None,
        arguments.bank_email,
    )
    workflow_session.bank_signup_status = {
        "completed": signup_response.ok,
        "message": "Created a bank account through the visible Bank signup flow.",
        "verifier_app_url": verifier_client.verifier_app_url,
        "signup_payload": {
            **signup_payload,
            "phone": DEFAULT_LOAN_APPLICATION["phone"],
            "accountType": "savings",
        },
        "signup_response": {
            "status_code": signup_response.status,
            "ok": signup_response.ok,
            "content_type": signup_response.headers.get("content-type", ""),
            "body": signup_response_body,
        },
    }
    if not signup_response.ok:
        raise RuntimeError(
            f"Create bank account through the visible Bank signup failed: "
            f"{signup_response.status} {signup_response_body}"
        )
    authentication_response = bank_context.request.get(
        f"{workflow_session.verifier_app_url.rstrip('/')}/auth/status"
    )
    authentication_status = authentication_response.json() if authentication_response.ok else {}
    if not authentication_status.get("authenticated"):
        raise RuntimeError(
            "The visible bank signup created an account but did not establish an authenticated Bank session."
        )
    workflow_session.bank_signup_status["authentication_status"] = authentication_status
    mark_step_completed(workflow_session, "bank_signup_completed")
    bank_page.wait_for_url("**/profile", wait_until="domcontentloaded", timeout=30_000)
    bank_page.get_by_text("Pre-qualified offer", exact=True).wait_for(state="visible", timeout=30_000)
    visual.show(bank_page, "Bank signup authenticated the new user and opened the loan-ready home page.")
    employment_wallet_engagement = visual.verifier_wallet_engagement(bank_page, "Apply for Loan")
    record_verifier_exchange(
        workflow_session,
        {
            "id": parse_uri_query(employment_wallet_engagement).get("state"),
            "execution_state": "pending",
            "wallet_engagement": employment_wallet_engagement,
            "qr": None,
        },
        BANK_EMPLOYMENT_PURPOSE,
    )
    mark_step_completed(workflow_session, "employment_verification_exchange_created")
    visual.copy_cookies_to("bank", verifier_client.session)
    visual.show(bank_page, "Bank displayed the proof-of-employment verification QR code.")
    employment_verification_result = present_and_finalise(
        workflow_session,
        wallet_client,
        verifier_client,
        credential_key="hr",
        purpose=BANK_EMPLOYMENT_PURPOSE,
        failure_message="The visual employment verification did not complete successfully.",
    )
    mark_step_completed(workflow_session, "employment_verification_completed")
    bank_page.get_by_text("Employment verified", exact=False).wait_for(state="visible", timeout=30_000)
    bank_page.locator("#phone").fill(DEFAULT_LOAN_APPLICATION["phone"])
    visual.show(bank_page, "Verified employment data pre-filled the loan application.")
    bank_page.get_by_role("button", name="Apply for Loan", exact=True).click()
    bank_page.get_by_text("Loan application submitted for review", exact=False).wait_for(
        state="visible", timeout=30_000
    )
    loan_application_payload = build_loan_application_payload(
        employment_verification_result.get("attributes")
        if isinstance(employment_verification_result, dict)
        else None
    )
    submit_loan_application(workflow_session, loan_application_payload)
    mark_step_completed(workflow_session, "loan_application_submitted")
    visual.show(bank_page, "Bank displayed the final loan-submission confirmation.", delay_seconds=3)


def save_session(workflow_session, file_path):
    # always persist the run artifact, even on failure,
    # so holder-session.json is enough to reconstruct what the script managed to do.
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    Path(file_path).write_text(json.dumps(asdict(workflow_session), indent=2), encoding="utf-8")


def build_result(workflow_session):
    return {
        "workflow_session": asdict(workflow_session),
        "summary": {
            "issuer_offer_created": workflow_session.issuer_offer is not None,
            "issued_credentials": sorted(workflow_session.issuer_offers.keys()),
            "verifier_exchange_created": workflow_session.verifier_exchange is not None,
            "holder_authenticated": bool(workflow_session.holder_token_status and workflow_session.holder_token_status.get("authenticated")),
            "verification_completed": bool(workflow_session.verification_status and workflow_session.verification_status.get("completed")),
            "bank_signup_completed": bool(workflow_session.bank_signup_status and workflow_session.bank_signup_status.get("completed")),
            "hr_issuance_completed": bool(workflow_session.holder_credential_statuses.get("hr", {}).get("completed")),
            "employment_verification_completed": bool(workflow_session.verification_statuses.get(BANK_EMPLOYMENT_PURPOSE, {}).get("completed")),
            "loan_application_completed": bool(workflow_session.loan_application_status and workflow_session.loan_application_status.get("completed")),
            "completed_steps": workflow_session.completed_steps,
        },
    }


def parse_arguments():
    parser = argparse.ArgumentParser(description="Run the OID4VC wallet-bypass flow with browser OAuth login.")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chromium headlessly. Do not use this when MFA or consent requires operator interaction.",
    )
    parser.add_argument(
        "--visual",
        action="store_true",
        help="Drive the visible DMV, Bank, and HR pages while the Python wallet completes QR handoffs.",
    )
    parser.add_argument(
        "--visual-step-delay",
        type=float,
        default=DEFAULT_VISUAL_STEP_DELAY_SECONDS,
        help="Seconds to pause on each important page state in --visual mode (default: 1.5).",
    )
    parser.add_argument(
        "--bank-email",
        required=True,
        help="Email address for the new Bank directory account. It is not a claim in the DMV verification template.",
    )
    arguments = parser.parse_args()
    if arguments.visual and arguments.headless:
        parser.error("--visual cannot be combined with --headless.")
    if arguments.visual_step_delay < 0:
        parser.error("--visual-step-delay cannot be negative.")
    return arguments


def main():
    # this is the whole story in order:
    # set up clients, create the DMV offer, start the verifier, let the wallet obtain
    # and present the credential from the two QR/deep-link URLs, poll for the result,
    # and finally save everything into holder-session.json whether it worked or not.
    arguments = parse_arguments()
    username, password = prompt_oauth_credentials()
    env_values = validate_env_values(parse_env_file(ENV_FILE))
    workflow_session = create_workflow_session(env_values)
    issuer_flows = build_issuer_flows(workflow_session)
    issuer_clients = {
        flow_key: IssuerClient(
            app_name=flow.app_name,
            issuer_app_url=flow.issuer_app_url,
            ca_bundle=CA_BUNDLE,
            offer_payload_builder=flow.offer_payload_builder,
        )
        for flow_key, flow in issuer_flows.items()
    }
    wallet_client = WalletClient(
        ca_bundle=CA_BUNDLE,
    )
    verifier_client = VerifierClient(
        workflow_session.verifier_app_url,
        CA_BUNDLE,
    )

    try:
        with BrowserAuthClient(
            username,
            password,
            headless=arguments.headless,
            visual=arguments.visual,
        ) as browser_auth:
            if arguments.visual:
                run_visual_workflow(
                    arguments,
                    browser_auth,
                    workflow_session,
                    wallet_client,
                    verifier_client,
                )
            else:
                run_api_workflow(
                    arguments,
                    browser_auth,
                    workflow_session,
                    issuer_flows,
                    issuer_clients,
                    wallet_client,
                    verifier_client,
                )

    except WorkflowBlocked as error:
        failed_credential_status = {
            "completed": False,
            "message": "Credential issuance cannot continue because browser OAuth authentication did not complete.",
        }
        workflow_session.holder_token_status = {
            "authenticated": False,
            "message": str(error),
        }
        workflow_session.holder_credential_status = failed_credential_status
        workflow_session.holder_credential_statuses = {
            flow_key: failed_credential_status for flow_key in issuer_flows
        }
        workflow_session.verification_status = {
            "completed": False,
            "message": "Verification cannot complete until the holder layer can redeem the DMV offer and submit a proof.",
        }
        workflow_session.errors.append(str(error))
    except Exception as error:
        workflow_session.errors.append(str(error))
        raise
    finally:
        save_session(workflow_session, DEFAULT_SESSION_FILE)

    print(json.dumps(build_result(workflow_session), indent=2))

    if workflow_session.errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
