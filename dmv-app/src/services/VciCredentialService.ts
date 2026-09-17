/**
 * Service for managing credential schemas and definitions
 * This service handles API calls to the backend service for creating and managing
 * credential schemas and definitions required by the DMV app.
 */
import diagencyApiService from './DiagencyApiService';
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
   * Create a credential offer for the digital wallet.
   * All credential data is assembled server-side; this call is a trigger only.
   * @returns A promise that resolves to the credential offer response containing id and credentialOfferPayload
   */
  async createCredentialOffer(): Promise<any> {
    // The server builds the credential_data from session data — send an empty trigger.
    return await diagencyApiService.authenticatedRequest('/credentials/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({})
    });
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
   * Create a credential offer and fetch its QR code image.
   * @returns A promise that resolves to an object containing the offer ID, image blob, and wallet engagement URL
   */
  async createOfferAndFetchImage(): Promise<{ id: string, imageBlob: Blob, walletEngagement: string }> {
    try {
      // Create the offer — the server stores the ID in the session.
      const offerResponse = await this.createCredentialOffer();
      
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