/**
 * Service for managing credential schemas and definitions
 * This service handles API calls to the backend service for creating and managing
 * credential schemas and definitions required by the DMV app.
 */
import diagencyApiService from './DiagencyApiService';
import defaultProfileImage from '../images/default-profile-male.jpeg';
import { reliableFetch } from '../reliableFetch';

class VciCredentialService {
  private schemaId: string | null = null;
  private definitionId: string | null = null;

  /**
   * Initialize the credential service by using the schema and definition IDs from environment variables
   * @returns A promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    try {
      // Get schema ID and credential definition ID from window.ENV
      const schemaId = window.ENV?.REACT_APP_CREDENTIAL_SCHEMA_ID;
      const definitionId = window.ENV?.REACT_APP_CREDENTIAL_DEFINITION_ID;

      if (!schemaId || !definitionId) {
        throw new Error('Missing credential schema or definition ID');
      }

      this.schemaId = schemaId;
      this.definitionId = definitionId;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the credential definition ID
   * @returns The credential definition ID
   */
  getCredentialDefinitionId(): string | null {
    return this.definitionId;
  }

  /**
   * Converts an image URL to a hexadecimal string representation
   * @param url The URL of the image to convert
   * @returns A promise that resolves to the hexadecimal string representation of the image
   */
  async imageUrlToHex(url: string): Promise<string> {
    const resp = await reliableFetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch image: ${resp.status}`);
    }

    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }

    return hex;
  }

  /**
   * Create a credential offer for the digital wallet
   * @param userProfile The user profile data to include in the credential (contains license details)
   * @returns A promise that resolves to the credential offer response containing id and credentialOfferPayload
   */
  async createCredentialOffer(userProfile: any): Promise<any> {
    try {
      // Get the credential definition ID
      const credentialDefinitionId = this.getCredentialDefinitionId();
      if (!credentialDefinitionId) {
        throw new Error('Credential definition ID not found');
      }

      const issuingCountry = userProfile.issuingCountry || 'AU';

      // Prepare the payload
      const payload = {
        credential_configuration_ids: [credentialDefinitionId],
        credential_data: {
          "org.iso.18013.5.1:document_number": userProfile.licenseNumber,
          "org.iso.18013.5.1:issue_date": userProfile.issueDate,
          "org.iso.18013.5.1:expiry_date": userProfile.expiryDate,
          "org.iso.18013.5.1:given_name": userProfile.firstName,
          "org.iso.18013.5.1:family_name": userProfile.lastName,
          "org.iso.18013.5.1:birth_date": userProfile.dateOfBirth,
          "org.iso.18013.5.1:issuing_country": issuingCountry,
          "org.iso.18013.5.1:issuing_authority": userProfile.issuingAuthority,
          "org.iso.18013.5.1:portrait": "/9j/4AAQSkZJRgABAQEAYABgAAD/4QBmRXhpZgAASUkqAAgAAAAEABoBBQABAAAAPgAAABsBBQABAAAARgAAACgBAwABAAAAAgAAADEBAgAQAAAATgAAAAAAAABgAAAAAQAAAGAAAAABAAAAUGFpbnQuTkVUIHYzLjMwAP/bAEMAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/bAEMBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/ACiiigD/2Q==",
          "org.iso.18013.5.1:driving_privileges": userProfile.drivingPrivileges,
          "org.iso.18013.5.1:un_distinguishing_sign": issuingCountry,
          "org.iso.18013.5.1:resident_address": userProfile.residentAddress,
          "org.iso.18013.5.1:resident_city": userProfile.residentCity,
          "org.iso.18013.5.1:resident_state": userProfile.residentState,
          "org.iso.18013.5.1:resident_postal_code": userProfile.residentPostalCode,
          "org.iso.18013.5.1:resident_country": "AU"
        }
      };

      // Make the API call using the diagencyApiService through the proxy
      return await diagencyApiService.authenticatedRequest('/credentials/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch the PNG image for a credential offer
   * @param offerId The ID of the offer
   * @returns A promise that resolves to the PNG image as a Blob
   */
  async fetchOfferImage(): Promise<Blob> {
    try {
      // The server resolves the offer ID from the session — no ID in the URL.
      const response = await diagencyApiService.authenticatedRawRequest('/credentials/offers', {
        method: 'GET',
        headers: {
          'Accept': 'image/png'
        }
      });
      
      // Return the response as a Blob
      return await response.blob();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a credential offer and fetch its QR code image
   * @param userProfile The user profile data to include in the credential (contains license details)
   * @returns A promise that resolves to an object containing the offer ID, image blob, and wallet engagement URL
   */
  async createOfferAndFetchImage(userProfile: any): Promise<{ id: string, imageBlob: Blob, walletEngagement: string }> {
    try {
      // Create the offer — the server stores the ID in the session.
      const offerResponse = await this.createCredentialOffer(userProfile);
      
      if (!offerResponse || !offerResponse.id) {
        throw new Error('Invalid response from create offer API');
      }

      const walletEngagement = 'openid-credential-offer://?credential_offer=' + encodeURIComponent(JSON.stringify(offerResponse.credentialOfferPayload));

      // Fetch the QR image — server resolves the offer ID from the session.
      const imageBlob = await this.fetchOfferImage();
      
      return {
        id: offerResponse.id,
        imageBlob,
        walletEngagement
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check the state of a credential offer
   * @param offerId The ID of the offer to check
   * @returns A promise that resolves to the offer state response
   */
  async checkOfferState(): Promise<{ state: string }> {
    try {
      // The server resolves the offer ID from the session — no ID in the URL.
      return await diagencyApiService.authenticatedRequest('/credentials/offers', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
    } catch (error) {
      throw error;
    }
  }
}

// Create a singleton instance
const vciCredentialService = new VciCredentialService();

export default vciCredentialService;

// Made with Bob