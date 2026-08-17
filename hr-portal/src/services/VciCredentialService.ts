import diagencyApiService from './DiagencyApiService';

const HR_EMPLOYMENT_NAMESPACE = 'com.example.hr.portal.1';

export interface HrEmploymentProfile {
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  documentNumber: string;
  employerName: string;
  employerEntityId: string;
  jobTitle: string;
  department: string;
  employmentStatus: string;
  employmentType: string;
  startDate: string;
  annualIncome: string;
  payFrequency: string;
  workLocation: string;
  managerName: string;
  issuingAuthority: string;
}

class VciCredentialService {
  private schemaId: string | null = null;
  private definitionId: string | null = null;

  async initialize(): Promise<void> {
    const schemaId = window.ENV?.REACT_APP_HR_CREDENTIAL_SCHEMA_ID;
    const definitionId = window.ENV?.REACT_APP_HR_CREDENTIAL_DEFINITION_ID;

    if (!schemaId || !definitionId) {
      throw new Error('Missing HR credential schema or definition ID. Run init.py and redeploy the HR portal.');
    }

    this.schemaId = schemaId;
    this.definitionId = definitionId;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.schemaId || !this.definitionId) {
      await this.initialize();
    }
  }

  getCredentialDefinitionId(): string | null {
    return this.definitionId;
  }

  async createCredentialOffer(userProfile: HrEmploymentProfile): Promise<any> {
    await this.ensureInitialized();

    const credentialDefinitionId = this.getCredentialDefinitionId();
    if (!credentialDefinitionId) {
      throw new Error('HR credential definition ID not found.');
    }

    const namespacePrefix = `${HR_EMPLOYMENT_NAMESPACE}:`;
    const payload = {
      credential_configuration_ids: [credentialDefinitionId],
      credential_data: {
        [`${namespacePrefix}employee_id`]: userProfile.employeeId,
        [`${namespacePrefix}document_number`]: userProfile.documentNumber,
        [`${namespacePrefix}given_name`]: userProfile.firstName,
        [`${namespacePrefix}family_name`]: userProfile.lastName,
        [`${namespacePrefix}email`]: userProfile.email,
        [`${namespacePrefix}employer_name`]: userProfile.employerName,
        [`${namespacePrefix}employer_entity_id`]: userProfile.employerEntityId,
        [`${namespacePrefix}job_title`]: userProfile.jobTitle,
        [`${namespacePrefix}department`]: userProfile.department,
        [`${namespacePrefix}employment_status`]: userProfile.employmentStatus,
        [`${namespacePrefix}employment_type`]: userProfile.employmentType,
        [`${namespacePrefix}start_date`]: userProfile.startDate,
        [`${namespacePrefix}annual_income`]: userProfile.annualIncome,
        [`${namespacePrefix}pay_frequency`]: userProfile.payFrequency,
        [`${namespacePrefix}work_location`]: userProfile.workLocation,
        [`${namespacePrefix}manager_name`]: userProfile.managerName,
        [`${namespacePrefix}issuing_authority`]: userProfile.issuingAuthority,
      },
    };

    return await diagencyApiService.authenticatedRequest('/credentials/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async fetchOfferImage(): Promise<Blob> {
    // The server resolves the offer ID from the session — no ID in the URL.
    const response = await diagencyApiService.authenticatedRawRequest('/credentials/offers', {
      method: 'GET',
      headers: {
        Accept: 'image/png',
      },
    });

    return await response.blob();
  }

  async createOfferAndFetchImage(userProfile: HrEmploymentProfile): Promise<{ id: string; imageBlob: Blob; walletEngagement: string }> {
    // Create the offer — the server stores the ID in the session.
    const offerResponse = await this.createCredentialOffer(userProfile);

    if (!offerResponse?.id || !offerResponse?.credentialOfferPayload) {
      throw new Error('Invalid response from the HR credential offer API.');
    }

    // Fetch the QR image — server resolves the offer ID from the session.
    const imageBlob = await this.fetchOfferImage();
    const walletEngagement = 'openid-credential-offer://?credential_offer=' + encodeURIComponent(JSON.stringify(offerResponse.credentialOfferPayload));

    return {
      id: offerResponse.id,
      imageBlob,
      walletEngagement,
    };
  }

  async checkOfferState(): Promise<{ state: string }> {
    // The server resolves the offer ID from the session — no ID in the URL.
    return await diagencyApiService.authenticatedRequest('/credentials/offers', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  }
}

const vciCredentialService = new VciCredentialService();

export default vciCredentialService;