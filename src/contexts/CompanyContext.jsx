import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

const CompanyContext = createContext(null)

export const ALL_COMPANIES = {
  id: 'all',
  name: 'All Companies (تمام کمپنیاں)',
  isAll: true,
}

export function CompanyProvider({ children }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState([])
  const [activeCompany, setActiveCompanyState] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch companies for the logged-in user
  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([])
      setActiveCompanyState(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching companies:', error)
      toast.error('Failed to load companies')
      setLoading(false)
      return
    }

    setCompanies(data || [])

    // Restore active company from localStorage or pick first
    const savedId = localStorage.getItem('dailykhata_active_company')
    if (savedId === 'all') {
      setActiveCompanyState(ALL_COMPANIES)
    } else {
      const savedCompany = data?.find(c => c.id === savedId)
      if (savedCompany) {
        setActiveCompanyState(savedCompany)
      } else if (data?.length > 0) {
        setActiveCompanyState(data[0])
        localStorage.setItem('dailykhata_active_company', data[0].id)
      } else {
        setActiveCompanyState(null)
      }
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const setActiveCompany = (company) => {
    if (company?.id === 'all' || company === 'all') {
      setActiveCompanyState(ALL_COMPANIES)
      localStorage.setItem('dailykhata_active_company', 'all')
      return
    }
    setActiveCompanyState(company)
    if (company) {
      localStorage.setItem('dailykhata_active_company', company.id)
    } else {
      localStorage.removeItem('dailykhata_active_company')
    }
  }

  const createCompany = async (name) => {
    if (!user) {
      const err = new Error('Not authenticated');
      toast.error('You must be signed in to create a company');
      return { data: null, error: err };
    }

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      const err = new Error('Company name is required');
      toast.error(err.message);
      return { data: null, error: err };
    }

    const { data, error } = await supabase
      .from('companies')
      .insert([{ name: trimmedName, user_id: user.id }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating company:', error);
      toast.error('Failed to create company: ' + error.message);
      return { data: null, error };
    }

    toast.success(`Company "${trimmedName}" created!`);
    await fetchCompanies();

    // Auto-select the new company if none is currently active or it's the first one
    if (companies.length === 0 || !activeCompany) {
      setActiveCompany(data);
    }

    return { data, error: null };
  };

  const updateCompany = async (id, name) => {
    const trimmedName = String(name || '').trim();
    const { data, error } = await supabase
      .from('companies')
      .update({ name: trimmedName })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating company:', error);
      toast.error('Failed to update company: ' + error.message);
      return { data: null, error };
    }

    toast.success('Company updated!');
    await fetchCompanies();

    // Update active company if it was the one edited
    if (activeCompany?.id === id) {
      setActiveCompanyState(data);
    }

    return { data, error: null };
  };

  const deleteCompany = async (id) => {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting company:', error);
      toast.error('Failed to delete company: ' + error.message);
      return { error };
    }

    toast.success('Company deleted');
    
    // If we deleted the active company, switch to another
    if (activeCompany?.id === id) {
      const remaining = companies.filter(c => c.id !== id);
      setActiveCompany(remaining[0] || null);
    }

    await fetchCompanies();
    return { error: null };
  };

  const value = {
    companies,
    activeCompany,
    currentCompany: activeCompany,
    isAllCompanies: activeCompany?.id === 'all',
    ALL_COMPANIES,
    setActiveCompany,
    setCurrentCompany: setActiveCompany,
    createCompany,
    addCompany: createCompany,
    updateCompany,
    deleteCompany,
    loading,
    refreshCompanies: fetchCompanies,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }
  return context
}
