import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  spacing: 6,
  palette: {
    primary: { main: '#225e4e' },
    secondary: { main: '#b86b24' },
    background: { default: '#f7f8fa', paper: '#fff' },
    text: { primary: '#24282d', secondary: '#687078' },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    body1: { fontSize: '0.875rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.45 },
    h4: { fontWeight: 650, fontSize: '1.25rem', lineHeight: 1.4 },
    h5: { fontWeight: 650, fontSize: '1.125rem' },
    h6: { fontWeight: 600, fontSize: '0.9375rem' },
    caption: { fontSize: '0.75rem' },
    overline: { fontSize: '0.6875rem', lineHeight: 2.6 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true, size: 'small' },
      styleOverrides: { root: { minHeight: 32, fontSize: '0.8125rem' } },
    },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '6px 12px', fontSize: '0.8125rem' },
        head: { fontWeight: 600, backgroundColor: '#fafbfc', height: 36 },
      },
    },
    MuiTablePagination: { styleOverrides: { toolbar: { minHeight: 42 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
    MuiTab: {
      styleOverrides: { root: { minHeight: 36, padding: '6px 14px', fontSize: '0.8125rem' } },
    },
    MuiInputBase: { styleOverrides: { root: { fontSize: '0.8125rem' } } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: '1px solid #e3e8e1' } },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiChip: { defaultProps: { size: 'small' }, styleOverrides: { root: { fontWeight: 600 } } },
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0 },
        a: { color: 'inherit' },
        '*': { boxSizing: 'border-box' },
      },
    },
  },
});
