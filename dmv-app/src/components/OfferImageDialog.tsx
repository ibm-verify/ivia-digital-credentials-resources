import React, { useState, useEffect, useRef } from 'react';
import CustomDialog from './CustomDialog';
import vciCredentialService from '../services/VciCredentialService';
import { Alert, Snackbar } from '@mui/material';

interface OfferImageDialogProps {
  isOpen: boolean;
  handleClose: () => void;
  triggerCreate?: boolean;
}

const OfferImageDialog: React.FC<OfferImageDialogProps> = ({ isOpen, handleClose, triggerCreate = false }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dialogData, setDialogData] = useState<Blob | undefined>(undefined);
  const [walletEngagement, setWalletEngagement] = useState<string>('');
  const [offerId, setOfferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState<boolean>(false);
  const [showErrorAlert, setShowErrorAlert] = useState<boolean>(false);
  
  // Use a ref to track if the component is mounted
  const isMountedRef = useRef<boolean>(true);
  // Use a ref to track if polling should continue
  const shouldPollRef = useRef<boolean>(false);
  // Use a ref to store the timeout ID
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set up cleanup when component mounts/unmounts
  useEffect(() => {
    // Set isMountedRef to true when component mounts
    isMountedRef.current = true;
    
    return () => {
      // Clean up when component unmounts
      isMountedRef.current = false;
      shouldPollRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const createOfferAndFetchImage = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      setErrorMessage(null);
      setShowSuccessAlert(false);
      setShowErrorAlert(false);

      // Create the offer and fetch the image in one step
      // Credential data is assembled server-side; no profile data is sent from the client.
      const result = await vciCredentialService.createOfferAndFetchImage();
      
      // Set the offer ID and dialog data
      setOfferId(result.id);
      setDialogData(result.imageBlob);
      setWalletEngagement(result.walletEngagement);
      
      // Only set loading to false after we have the image
      setIsLoading(false);
    } catch (error: any) {
      setError('Failed to create and load the credential offer. Please try again.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && triggerCreate) {
      createOfferAndFetchImage();
    } else if (!isOpen) {
      // Stop polling when dialog closes
      shouldPollRef.current = false;
      setOfferId(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isOpen, triggerCreate]);

  // Start polling when offerId is set and not loading
  useEffect(() => {
    if (offerId && !isLoading && isOpen) {
      shouldPollRef.current = true;
      pollOfferState();
    }
  }, [offerId, isLoading, isOpen]);

  const pollOfferState = async () => {
    if (!shouldPollRef.current || !isMountedRef.current) {
      return;
    }

    try {
      // The server resolves the offer ID from the session — no ID passed here.
      const response = await vciCredentialService.checkOfferState();
      
      // Handle different states
      if (response.state === 'Completed') {
        // Success state
        setSuccessMessage('Your digital credential has successfully been added to your wallet');
        setShowSuccessAlert(true);
        
        // Stop polling
        shouldPollRef.current = false;
        
        // Close the dialog after a delay
        setTimeout(() => {
          if (isMountedRef.current) {
            handleClose();
          }
        }, 3000);
      } else if (response.state === 'Error') {
        // Error state
        setErrorMessage('An error occurred while adding the credential to your wallet. Please try again.');
        setShowErrorAlert(true);
        
        // Stop polling
        shouldPollRef.current = false;
        setOfferId(null);
        
        // Close the dialog after a delay
        setTimeout(() => {
          if (isMountedRef.current) {
            handleClose();
          }
        }, 3000);
      } else if (response.state === 'Expired') {
        // Expired state
        setErrorMessage('The credential offer expired. Please try again.');
        setShowErrorAlert(true);
        
        // Stop polling
        shouldPollRef.current = false;
        setOfferId(null);
        
        // Close the dialog after a delay
        setTimeout(() => {
          if (isMountedRef.current) {
            handleClose();
          }
        }, 3000);
      } else {
        // For other states, continue polling after delay
        if (shouldPollRef.current && isMountedRef.current) {
          timeoutRef.current = setTimeout(pollOfferState, 3000);
        }
      }
    } catch (error) {
      // Even on error, continue polling after delay
      if (shouldPollRef.current && isMountedRef.current) {
        timeoutRef.current = setTimeout(pollOfferState, 3000);
      }
    }
  };
  
  const handleAlertClose = () => {
    setShowSuccessAlert(false);
    setShowErrorAlert(false);
  };

  return (
    <>
      <CustomDialog
        isOpen={isOpen}
        isLoading={isLoading}
        handleClose={handleClose}
        title="Scan the QR code with your digital wallet"
        dialogData={dialogData}
        walletEngagement={walletEngagement}
      />
      
      {/* Success Alert */}
      <Snackbar
        open={showSuccessAlert}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 24 }}
      >
        <Alert
          onClose={handleAlertClose}
          severity="success"
          sx={{
            width: '100%',
            fontSize: '1.1rem',
            '& .MuiAlert-message': {
              fontSize: '1.1rem',
              py: 1
            },
            boxShadow: 3
          }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
      
      {/* Error Alert */}
      <Snackbar
        open={showErrorAlert}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 24 }}
      >
        <Alert
          onClose={handleAlertClose}
          severity="error"
          sx={{
            width: '100%',
            fontSize: '1.1rem',
            '& .MuiAlert-message': {
              fontSize: '1.1rem',
              py: 1
            },
            boxShadow: 3
          }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default OfferImageDialog;

// Made with Bob
