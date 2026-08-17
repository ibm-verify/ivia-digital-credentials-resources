import React from 'react';
import { useNavigate } from 'react-router';
import stockMarketImage from '../images/stock-market.png';
import testimonialImage from '../images/testimonial.png';
import bankingImage from '../images/banking.png';
import {
  Button,
  Container,
  Typography,
  Box,
  Paper,
  useTheme,
  Divider
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { ArrowForward, Check } from '@mui/icons-material';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box>
      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="h2" component="h1" gutterBottom fontWeight="bold" sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
              Bank Smarter.
              <br />
              Live Better.
            </Typography>
            <Typography variant="body1" paragraph sx={{ mb: 4, color: 'text.secondary', fontSize: '1.1rem' }}>
              Manage your finances effortlessly with our advanced banking solutions. Safe, fast, and designed for your everyday needs.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate('/signup')}
                sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2,
                }}
              >
                Get Started Today
              </Button>
              <Button
                variant="text"
                size="large"
                endIcon={<ArrowForward />}
                sx={{
                  px: 3,
                  py: 1.5,
                  color: theme.palette.text.primary,
                }}
                onClick={(e) => e.preventDefault()}
              >
                Learn More
              </Button>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ position: 'relative' }}>
              {/* Main image with app screenshots */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    height: '400px',
                  }}
                >
                  {/* Mobile app mockup */}
                  <Paper
                    elevation={0}
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '80%',
                      height: '90%',
                      borderRadius: 4,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundImage: `url(${bankingImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      transition: 'none',
                      pointerEvents: 'none',
                      '&:hover': {
                        transform: 'translate(-50%, -50%)',
                      }
                    }}
                  />
                  
                  {/* Balance card */}
                  <Paper
                    elevation={3}
                    sx={{
                      position: 'absolute',
                      top: '10%',
                      left: '10%',
                      width: '200px',
                      p: 2,
                      borderRadius: 2,
                      backgroundColor: 'white',
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary">
                      BANK CARD
                    </Typography>
                    <Typography variant="h6" fontWeight="bold" sx={{ mt: 1 }}>
                      $500K USD
                    </Typography>
                  </Paper>
                  
                  {/* Services card */}
                  <Paper
                    elevation={3}
                    sx={{
                      position: 'absolute',
                      bottom: '10%',
                      right: '10%',
                      width: '250px',
                      p: 2,
                      borderRadius: 2,
                      backgroundColor: 'white',
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight="bold" color="primary">
                      WE PROVIDE
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      BEST SERVICES
                    </Typography>
                  </Paper>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Stats Section */}
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 4,
            backgroundColor: theme.palette.primary.main,
            color: 'white',
          }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: 'center', borderRight: { md: '1px solid rgba(255,255,255,0.2)' } }}>
              <Typography variant="h2" fontWeight="bold">
                100K
              </Typography>
              <Typography variant="body1">
                Customers worldwide
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: 'center', borderRight: { md: '1px solid rgba(255,255,255,0.2)' } }}>
              <Typography variant="h2" fontWeight="bold">
                99%
              </Typography>
              <Typography variant="body1">
                Customer satisfaction and growing
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: 'center' }}>
              <Typography variant="h2" fontWeight="bold">
                #2
              </Typography>
              <Typography variant="body1">
                Banking app
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </Container>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h3" component="h2" gutterBottom sx={{ mb: 6 }}>
          Discover Our Key Features
        </Typography>
        
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                  Exchange Rate
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  1 USD = 0.85 EUR
                </Typography>
                <Box
                  component="img"
                  src={stockMarketImage}
                  alt="Exchange Rate Chart"
                  sx={{ width: '100%', borderRadius: 2 }}
                />
              </Box>
              
              <Box>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                  International Money Transfer
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Send money globally with competitive rates
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                p: 3,
                border: '1px solid #eee',
                borderRadius: 4,
                height: '100%',
              }}
            >
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                  Welcome back!
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ mb: 2 }}>
                  $20,884.99
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button variant="outlined" size="small" onClick={(e) => e.preventDefault()}>
                    Send
                  </Button>
                  <Button variant="outlined" size="small" onClick={(e) => e.preventDefault()}>
                    Request
                  </Button>
                </Box>
              </Box>
              
              <Divider sx={{ my: 3 }} />
              
              <Box sx={{ mb: 3 }}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: theme.palette.primary.main,
                    color: 'white',
                    mb: 3,
                  }}
                >
                  <Typography variant="subtitle2">
                    PREMIUM CARD
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
                    1234 5678 9012 3456
                  </Typography>
                  <Typography variant="subtitle2">
                    Smart money.
                  </Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Withdraw Money Easily
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ my: 1 }}>
                    $98,481.44
                  </Typography>
                  <Button variant="contained" fullWidth onClick={(e) => e.preventDefault()}>
                    Withdraw
                  </Button>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Pricing Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h3" component="h2" gutterBottom>
          Find the right plan for your needs
        </Typography>
        <Box sx={{ mb: 4 }}>
          <Button variant="outlined" size="small" onClick={(e) => e.preventDefault()}>
            Compare Plans
          </Button>
        </Box>
        
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ p: 4, border: '1px solid #eee', borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                BASIC PLAN
              </Typography>
              <Typography variant="h3" fontWeight="bold" sx={{ my: 2 }}>
                $15
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                per user per month
              </Typography>
              
              <Button variant="outlined" fullWidth sx={{ mb: 4 }} onClick={(e) => e.preventDefault()}>
                Get Started
              </Button>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Ideal for small businesses and startups
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" color="primary" />
                  <Typography variant="body2">Comprehensive UI tools for team plan</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" color="primary" />
                  <Typography variant="body2">Digital management</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" color="primary" />
                  <Typography variant="body2">Enterprise-level service</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" color="primary" />
                  <Typography variant="body2">Up to 100 users</Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
          
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ p: 4, borderRadius: 2, bgcolor: '#1A1A4B', color: 'white' }}>
              <Typography variant="subtitle2" color="white">
                PROFESSIONAL PLAN
              </Typography>
              <Typography variant="h3" fontWeight="bold" sx={{ my: 2 }}>
                $59
              </Typography>
              <Typography variant="body2" sx={{ mb: 3, color: 'rgba(255,255,255,0.7)' }}>
                per user per month
              </Typography>
              
              <Button variant="contained" fullWidth sx={{ mb: 4 }} onClick={(e) => e.preventDefault()}>
                Get Started
              </Button>
              
              <Typography variant="body2" sx={{ mb: 2, color: 'rgba(255,255,255,0.7)' }}>
                Designed for growing businesses
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" sx={{ color: 'white' }} />
                  <Typography variant="body2">All features from the Starter Plan</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" sx={{ color: 'white' }} />
                  <Typography variant="body2">Advanced analytics and insights</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" sx={{ color: 'white' }} />
                  <Typography variant="body2">Customizable workflows and forms</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Check fontSize="small" sx={{ color: 'white' }} />
                  <Typography variant="body2">Up to 500 users</Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
        
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Need advice on a suitable pricing plan?
          </Typography>
          <Button variant="text" color="primary" endIcon={<ArrowForward />} onClick={(e) => e.preventDefault()}>
            Contact Us
          </Button>
        </Box>
      </Container>

      {/* Testimonial Section */}
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" component="div" sx={{ mb: 2 }}>
                "Working with Smart Money has been a game-changer for my financial well-being. Their expert guidance and user-friendly tools made easy to understand."
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Kylan Systems
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      bgcolor: theme.palette.primary.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '0.8rem',
                    }}
                  >
                    →
                  </Box>
                </Box>
              </Box>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box
              component="img"
              src={testimonialImage}
              alt="Testimonial"
              sx={{
                width: '100%',
                borderRadius: 2,
                height: { xs: '280px', md: '240px' },
                objectFit: 'cover',
                objectPosition: 'center 30%' // Adjusted to focus on the face
              }}
            />
          </Grid>
        </Grid>
      </Container>

      {/* CTA Section */}
      <Box
        sx={{
          bgcolor: '#0A0A2B',
          color: 'white',
          py: 8,
          borderRadius: '24px 24px 0 0',
          mt: 8,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', maxWidth: '700px', mx: 'auto', mb: 6 }}>
            <Typography variant="h3" component="h2" gutterBottom>
              Take control of your financial future today.
            </Typography>
            <Typography variant="body1" sx={{ mb: 4, color: 'rgba(255,255,255,0.7)' }}>
              Empower your financial journey with personalized insights and easy-to-use tools designed to help you make confident decisions.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Box
                component="input"
                placeholder="Your email"
                sx={{
                  p: 1.5,
                  px: 3,
                  borderRadius: 2,
                  border: 'none',
                  width: '250px',
                  fontSize: '1rem',
                }}
              />
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate('/signup')}
              >
                Get Started
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default HomePage;

// Made with Bob
