import * as React from 'react';
import { Breakpoint, styled } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Typography from '@mui/material/Typography';
import { Backdrop, Box, CircularProgress, Link } from '@mui/material';

const BootstrapDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialogContent-root': {
    padding: theme.spacing(3),
  },
  '& .MuiDialogActions-root': {
    padding: theme.spacing(1),
  },
}));

export interface CustomDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  title?: string;
  handleClose: () => void;
  walletEngagement?: string;
  dialogData: React.ReactNode | Blob | null;
  maxWidth?: Breakpoint;
}

export default function CustomDialog(props: CustomDialogProps) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let url: string | null = null;

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    if (props.dialogData instanceof Blob) {
      url = URL.createObjectURL(props.dialogData);
      setImageUrl(url);
    } else {
      setImageUrl(null);
    }

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.walletEngagement, props.dialogData]);

  if (props.isLoading && props.isOpen) {
    return (
      <Backdrop
        sx={(theme) => ({ color: '#fff', zIndex: theme.zIndex.drawer + 1 })}
        open={true}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    );
  }

  return (
    <React.Fragment>
      <BootstrapDialog
        className="dc-custom-dialog"
        maxWidth={props.maxWidth ?? 'md'}
        onClose={() => props.handleClose()}
        aria-labelledby="customized-dialog-title"
        open={props.isOpen}
      >
        <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
          {props.title}
        </DialogTitle>
        <IconButton
          aria-label="close"
          onClick={() => props.handleClose()}
          sx={(theme) => ({
            position: 'absolute',
            right: 8,
            top: 8,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent dividers>
          {props.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 4 }}>
              <CircularProgress />
            </Box>
          ) : imageUrl ? (
            <div>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <img
                  src={imageUrl}
                  alt="Credential Offer QR Code"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '400px',
                    backgroundColor: '#ffffff',
                  }}
                />
              </Box>
              <Link
                href={props.walletEngagement}
                underline="hover"
                sx={{
                  mt: 2,
                  display: 'block',
                  textAlign: 'center',
                  color: 'primary.main',
                  fontWeight: 'medium',
                  cursor: 'pointer',
                }}
              >
                Or click here to add to a wallet on this device
              </Link>
            </div>
          ) : props.dialogData && !(props.dialogData instanceof Blob) ? (
            <Box sx={{ width: '100%' }}>{props.dialogData as React.ReactNode}</Box>
          ) : (
            <Typography gutterBottom>No content available to display.</Typography>
          )}
        </DialogContent>
      </BootstrapDialog>
    </React.Fragment>
  );
}