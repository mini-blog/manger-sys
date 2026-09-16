import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#225e4e' },
    secondary: { main: '#b86b24' },
    background: { default: '#f5f6f3', paper: '#fff' },
    text: { primary: '#20372f', secondary: '#68786f' },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 650, letterSpacing: '-1px' },
    h5: { fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
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
