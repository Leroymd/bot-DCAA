// src/styles/inlineStyles.js
// Экспортируем базовые стили, которые можно использовать как резервные,
// если Tailwind CSS не загрузится правильно

export const styles = {
  container: {
    backgroundColor: '#111827',
    color: '#f3f4f6',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    backgroundColor: '#1f2937',
    padding: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #374151'
  },
  logo: {
    fontWeight: 'bold',
    fontSize: '1.25rem',
    color: '#60a5fa'
  },
  nav: {
    backgroundColor: '#1f2937',
    borderBottom: '1px solid #374151'
  },
  navLink: {
    padding: '0.75rem 0.25rem',
    color: '#9ca3af',
    display: 'inline-block'
  },
  navLinkActive: {
    color: '#60a5fa',
    borderBottom: '2px solid #60a5fa'
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #374151',
    marginBottom: '1.5rem'
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: '1rem'
  },
  statusBadgeActive: {
    backgroundColor: '#059669',
    color: 'white',
    fontSize: '0.75rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem'
  },
  statusBadgeInactive: {
    backgroundColor: '#dc2626',
    color: 'white',
    fontSize: '0.75rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem'
  },
  button: {
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  buttonGreen: {
    backgroundColor: '#059669',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  buttonRed: {
    backgroundColor: '#dc2626',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    backgroundColor: '#374151',
    textAlign: 'left'
  },
  tableHeaderCell: {
    padding: '1rem'
  },
  tableRow: {
    borderTop: '1px solid #4b5563'
  },
  tableCell: {
    padding: '1rem'
  },
  textSuccess: {
    color: '#34d399'
  },
  textError: {
    color: '#f87171'
  }
};

export default styles;
