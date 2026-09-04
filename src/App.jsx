import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { CompanyProvider } from '@/contexts/CompanyContext'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import DashboardLayout from '@/components/layout/DashboardLayout'
import LoginPage from '@/pages/auth/LoginPage'
import AuthCallback from '@/pages/auth/AuthCallback'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import CompaniesPage from '@/pages/companies/CompaniesPage'
import CustomersPage from '@/pages/customers/CustomersPage'
import CustomerLedgerPage from '@/pages/customers/CustomerLedgerPage'
import FuelInventoryPage from '@/pages/fuel/FuelInventoryPage'
import FuelPurchasesPage from '@/pages/fuel/FuelPurchasesPage'
import SalesPage from '@/pages/sales/SalesPage'
import ExpensesPage from '@/pages/expenses/ExpensesPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import SettingsPage from '@/pages/settings/SettingsPage'

import BulkActionsPage from '@/pages/bulkactions/BulkActionsPage'
import RecycleBinPage from '@/pages/recyclebin/RecycleBinPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CompanyProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/companies" element={<CompaniesPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/customers/:customerId/ledger" element={<CustomerLedgerPage />} />
                <Route path="/fuel" element={<FuelInventoryPage />} />
                <Route path="/fuel/purchases" element={<FuelPurchasesPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/bulk-actions" element={<BulkActionsPage />} />
                <Route path="/recycle-bin" element={<RecycleBinPage />} />
              </Route>
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CompanyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
