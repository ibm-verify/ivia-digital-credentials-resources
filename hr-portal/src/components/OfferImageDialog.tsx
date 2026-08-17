import React, { useEffect, useRef, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import CustomDialog from './CustomDialog';
import vciCredentialService, { HrEmploymentProfile } from '../services/VciCredentialService';

interface OfferImageDialogProps {
  isOpen: boolean;
  handleClose: () => void;
  triggerCreate?: boolean;
  userProfile: HrEmploymentProfile;
}

const OfferImageDialog: React.FC<OfferImageDialogProps> = ({
  isOpen,
  handleClose,
  triggerCreate = false,
  userProfile,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dialogData, setDialogData] = useState<Blob | React.ReactNode | null>(null);
  const [walletEngagement, setWalletEngagement] = useState<string>('');
  const [offerId, setOfferId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState<boolean>(false);
  const [showErrorAlert, setShowErrorAlert] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const shouldPollRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetDialogState = () => {
    shouldPollRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setDialogData(null);
    setWalletEngagement('');
    setOfferId(null);
    setIsLoading(false);
    setSuccessMessage(null);
    setErrorMessage(null);
    setShowSuccessAlert(false);
    setShowErrorAlert(false);
  };

  const handleDialogClose = () => {
    resetDialogState();
    handleClose();
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
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
      resetDialogState();
      setIsLoading(true);

      await vciCredentialService.initialize();
      const result = await vciCredentialService.createOfferAndFetchImage(userProfile);

      if (!isMountedRef.current) {
        return;
      }

      setOfferId(result.id);
      setDialogData(result.imageBlob);
      setWalletEngagement(result.walletEngagement);
      setIsLoading(false);
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = error instanceof Error
        ? error.message
        : 'Failed to create and load the employment credential offer. Please try again.';

      setDialogData(<Alert severity="error">{message}</Alert>);
      setErrorMessage(message);
      setShowErrorAlert(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && triggerCreate) {
      createOfferAndFetchImage();
    } else if (!isOpen) {
      resetDialogState();
    }
  }, [isOpen, triggerCreate]);

  useEffect(() => {
    if (offerId && !isLoading && isOpen) {
      shouldPollRef.current = true;
      void pollOfferState();
    }
  }, [offerId, isLoading, isOpen]);

  const pollOfferState = async () => {
    if (!shouldPollRef.current || !isMountedRef.current) {
      return;
    }

    try {
      // The server resolves the offer ID from the session — no ID passed here.
      const response = await vciCredentialService.checkOfferState();

      if (response.state === 'Completed') {
        setSuccessMessage('The employment credential has been added to the wallet.');
        setShowSuccessAlert(true);
        shouldPollRef.current = false;
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            handleDialogClose();
          }
        }, 3000);
        return;
      }

      if (response.state === 'Error' || response.state === 'Expired') {
        const message = response.state === 'Expired'
          ? 'The employment credential offer expired. Please try again.'
          : 'An error occurred while adding the employment credential to the wallet.';

        setErrorMessage(message);
        setShowErrorAlert(true);
        shouldPollRef.current = false;
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            handleDialogClose();
          }
        }, 3000);
        return;
      }

      if (shouldPollRef.current && isMountedRef.current) {
        timeoutRef.current = setTimeout(() => {
          void pollOfferState();
        }, 3000);
      }
    } catch {
      if (shouldPollRef.current && isMountedRef.current) {
        timeoutRef.current = setTimeout(() => {
          void pollOfferState();
        }, 3000);
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
        handleClose={handleDialogClose}
        title="Scan the QR code with your digital wallet"
        dialogData={dialogData}
        walletEngagement={walletEngagement}
      />

      <Snackbar
        open={showSuccessAlert}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 24 }}
      >
        <Alert onClose={handleAlertClose} severity="success" sx={{ width: '100%', boxShadow: 3 }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={showErrorAlert}
        autoHideDuration={6000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: 24 }}
      >
        <Alert onClose={handleAlertClose} severity="error" sx={{ width: '100%', boxShadow: 3 }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default OfferImageDialog;