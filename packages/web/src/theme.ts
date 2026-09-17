import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#225e4e' },
    secondary: { main: '#b86b24' },
    background: { default: '#f7f8fa', paper: '#fff' },
    text: { primary: '#24282d', secondary: '#687078' },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 650, fontSize: '1.6rem', letterSpacing: '-0.4px' },
    h5: { fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: '1px solid #e3e8e1' } },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0 },
        a: { color: 'inherit' },
        '*': { boxSizing: 'border-box' },
      },
    },
  },
});
