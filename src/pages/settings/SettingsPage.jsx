import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import { getPreviousNetBalance, savePreviousNetBalance } from '@/utils/balanceUtils';
import { clearAllDatabaseRecords } from '@/utils/deletedRecordsManager';
import { emptyTrash } from '@/utils/trashManager';
import { formatCurrency } from '@/utils/formatters';
import { formatDateDisplay } from '@/utils/dateUtils';
import toast from 'react-hot-toast';
import {
  BuildingStorefrontIcon,
  BanknotesIcon,
  BeakerIcon,
  UserCircleIcon,
  InformationCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { activeCompany, companies, isAllCompanies } = useCompany();

  // Company selected for settings (if All Companies is selected)
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  // Initial stock & balance states
  const [prevNetBalance, setPrevNetBalance] = useState('');
  const [petrolStock, setPetrolStock] = useState('');
  const [dieselStock, setDieselStock] = useState('');
  const [loading, setLoading] = useState(false);

  // Print settings state
  const [printerType, setPrinterType] = useState('regular');
  const [printLayout, setPrintLayout] = useState('layout1');
  const [themeColor, setThemeColor] = useState('#4f46e5');
  const [companyDetails, setCompanyDetails] = useState({
    name: '',
    number: '',
    email: '',
    address: ''
  });
  const [printPageSize, setPrintPageSize] = useState('A4');
  const [printTextSize, setPrintTextSize] = useState('medium');

  useEffect(() => {
    if (activeCompany?.id && !selectedCompanyId) {
      setSelectedCompanyId(activeCompany.id);
    } else if (companies?.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [activeCompany, companies]);

  const targetCompany = companies?.find((c) => c.id === selectedCompanyId) || activeCompany;

  const loadPrintSettings = () => {
    if (!targetCompany) return;
    try {
      const raw = localStorage.getItem(`vyapar_company_settings_${targetCompany.id}`);
      if (raw) {
        const d = JSON.parse(raw);
        setPrinterType(d.printerType || 'regular');
        setPrintLayout(d.printLayout || 'layout1');
        setThemeColor(d.themeColor || '#4f46e5');
        setPrintPageSize(d.printPageSize || 'A4');
        setPrintTextSize(d.printTextSize || 'medium');
        setCompanyDetails({
          name: d.details?.name || targetCompany.name,
          number: d.details?.number || '',
          email: d.details?.email || '',
          address: d.details?.address || ''
        });
      } else {
        setCompanyDetails(prev => ({ ...prev, name: targetCompany.name }));
        setPrinterType('regular');
        setPrintLayout('layout1');
        setThemeColor('#4f46e5');
      }
    } catch {}
  };

  useEffect(() => {
    if (targetCompany) {
      // Load previous net balance
      const balance = getPreviousNetBalance(targetCompany);
      setPrevNetBalance(balance !== 0 ? String(balance) : '');

      fetchInitialStock(targetCompany.id);
      loadPrintSettings();
    }
  }, [selectedCompanyId, targetCompany, isAllCompanies]);

  const fetchInitialStock = async (companyId) => {
    try {
      const { data, error } = await supabase
        .from('fuel_initial_stock')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;

      const petrol = data?.find((d) => d.fuel_type === 'petrol');
      const diesel = data?.find((d) => d.fuel_type === 'diesel');

      setPetrolStock(petrol ? String(petrol.initial_balance) : '');
      setDieselStock(diesel ? String(diesel.initial_balance) : '');
    } catch (err) {
      console.error(err);
    }
  };

  // Save Previous Net Balance
  const handleSavePreviousNetBalance = async (e) => {
    e.preventDefault();
    if (!targetCompany?.id) {
      toast.error('Please select a company');
      return;
    }

    setLoading(true);
    try {
      await savePreviousNetBalance(targetCompany.id, prevNetBalance);
      toast.success(`Previous Net Balance saved for ${targetCompany.name}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save balance');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStock = async (fuelType, balance) => {
    if (!targetCompany?.id) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('fuel_initial_stock')
        .select('id')
        .eq('company_id', targetCompany.id)
        .eq('fuel_type', fuelType)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('fuel_initial_stock')
          .update({ initial_balance: parseFloat(balance || 0) })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fuel_initial_stock').insert({
          company_id: targetCompany.id,
          fuel_type: fuelType,
          initial_balance: parseFloat(balance || 0),
          effective_date: new Date().toISOString().split('T')[0],
        });
        if (error) throw error;
      }
      toast.success(`${fuelType.toUpperCase()} initial stock saved`);
    } catch (err) {
      toast.error(`Failed to save ${fuelType} stock`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrintSettings = (e) => {
    e.preventDefault();
    if (!targetCompany?.id) return;
    try {
      const data = {
        printerType,
        printLayout,
        themeColor,
        printPageSize,
        printTextSize,
        details: companyDetails
      };
      localStorage.setItem(`vyapar_company_settings_${targetCompany.id}`, JSON.stringify(data));
      toast.success('Print settings and company details saved successfully!');
    } catch (err) {
      toast.error('Failed to save print settings');
    }
  };

  // Wipe / Clear all database records so only new entries remain
  const [clearing, setClearing] = useState(false);
  const handleClearDatabase = async () => {
    if (!window.confirm('Are you sure you want to completely clear and wipe all records from the database? This will reset all periods (Daily, 7 Days, Monthly, Yearly) to zero so only new records are saved.')) {
      return;
    }
    setClearing(true);
    try {
      await clearAllDatabaseRecords(isAllCompanies ? null : targetCompany?.id);
      emptyTrash(isAllCompanies ? null : targetCompany?.id);
      toast.success('Database completely cleared! All periods reset to 0.');
    } catch (e) {
      toast.error('Failed to clear database');
    } finally {
      setClearing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage starting balances, fuel initial stock, trash bin, and accounting rules
        </p>
      </div>

      {/* Company Selector (if All Companies is selected) */}
      {companies?.length > 1 && (
        <div className="card p-3 bg-indigo-50/50 border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BuildingStorefrontIcon className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-700">Settings For Company:</span>
          </div>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="text-xs font-semibold border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 1. Previous Net Balance Setting Card */}
      {targetCompany ? (
        <div className="card p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
            <BanknotesIcon className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Previous Net Balance / Starting Cash — {targetCompany.name}
            </h2>
          </div>

          <form onSubmit={handleSavePreviousNetBalance} className="space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              Set the initial or carried-over net cash balance (سابقہ رقم / کیش ان ہینڈ) for this firm.
              This amount is added to your Net Balance calculation across the Dashboard and Reports.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 max-w-md">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Previous Net Balance (Rs)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 150000.00"
                  value={prevNetBalance}
                  onChange={(e) => setPrevNetBalance(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 font-mono font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary text-xs w-full sm:w-auto"
              >
                Save Balance
              </button>
            </div>

            {prevNetBalance && (
              <p className="text-[11px] text-emerald-700 font-medium">
                Current Active Starting Balance: {formatCurrency(prevNetBalance)}
              </p>
            )}
          </form>
        </div>
      ) : (
        <div className="card p-4 bg-amber-50 text-amber-800 text-xs border border-amber-200">
          Please select or create a company to manage settings.
        </div>
      )}

      {/* 2. Fuel Initial Stock Card */}
      {targetCompany && (
        <div className="card p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
            <BeakerIcon className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Fuel Initial Stock — {targetCompany.name}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Set the starting tank stock (Liters) for calculating daily opening and closing fuel levels.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Petrol Initial Stock (Liters)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={petrolStock}
                  onChange={(e) => setPetrolStock(e.target.value)}
                  className="flex-1 text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="0.00"
                />
                <button
                  onClick={() => handleSaveStock('petrol', petrolStock)}
                  disabled={loading}
                  className="btn-primary text-xs"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Diesel Initial Stock (Liters)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={dieselStock}
                  onChange={(e) => setDieselStock(e.target.value)}
                  className="flex-1 text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="0.00"
                />
                <button
                  onClick={() => handleSaveStock('diesel', dieselStock)}
                  disabled={loading}
                  className="btn-primary text-xs"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Print Settings & Company Header Details */}
      {targetCompany && (
        <div className="card p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
            <h2 className="text-sm font-bold text-slate-900">
              Print Settings & Company Details — {targetCompany.name}
            </h2>
          </div>
          
          <form onSubmit={handleSavePrintSettings} className="space-y-4">
            {/* Tabs for printer type */}
            <div className="flex gap-4 border-b pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="printerType" 
                  value="regular"
                  checked={printerType === 'regular'}
                  onChange={() => setPrinterType('regular')}
                />
                <span className="text-sm font-medium">Regular Printer (A4/A5)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="printerType" 
                  value="thermal"
                  checked={printerType === 'thermal'}
                  onChange={() => setPrinterType('thermal')}
                />
                <span className="text-sm font-medium">Thermal Printer (Receipt)</span>
              </label>
            </div>

            {/* Layout Options (1 to 10) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Print Layout Select</label>
              <div className="flex flex-wrap gap-2">
                {[1,2,3,4,5,6,7,8,9,10].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPrintLayout(`layout${num}`)}
                    className={`px-3 py-1 text-xs border rounded ${printLayout === `layout${num}` ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Layout {num}
                  </button>
                ))}
              </div>
              
              {/* Layout Preview */}
              <div className="mt-4 p-4 border rounded-xl bg-slate-50 flex flex-col items-center justify-center">
                <span className="text-xs text-slate-500 mb-2">Live Layout Preview</span>
                <div 
                  className="bg-white shadow-sm border border-slate-200 transition-all duration-300 relative overflow-hidden"
                  style={{ 
                    width: printerType === 'thermal' ? '150px' : '220px',
                    height: '280px',
                    padding: '10px'
                  }}
                >
                  {/* Header Preview */}
                  <div 
                    className={`text-center pb-2 border-b-2 mb-2 ${
                      printLayout === 'layout2' || printLayout === 'layout6' ? 'text-left border-b border-dashed' : 
                      printLayout === 'layout3' || printLayout === 'layout7' ? 'bg-slate-100 rounded p-2 border-none' : 
                      printLayout === 'layout4' || printLayout === 'layout8' ? 'border-b-4' : 
                      printLayout === 'layout5' || printLayout === 'layout9' ? 'text-right border-b border-dotted' : 
                      printLayout === 'layout10' ? 'border-b-0 shadow-sm mb-3' : ''
                    }`}
                    style={{ borderColor: themeColor }}
                  >
                    <div 
                      className="font-bold text-[10px]" 
                      style={{ 
                        color: printLayout === 'layout3' || printLayout === 'layout8' || printLayout === 'layout10' ? themeColor : '#333'
                      }}
                    >
                      {companyDetails.name || 'Company Name'}
                    </div>
                    <div className="text-[7px] text-gray-500">{companyDetails.number || '123-456-7890'}</div>
                    <div className="text-[7px] text-gray-500">{companyDetails.address || 'Company Address Area'}</div>
                  </div>
                  
                  {/* Body Preview */}
                  <div className="space-y-1.5 mb-2">
                    <div className="h-2 w-3/4 rounded" style={{ backgroundColor: printLayout === 'layout4' || printLayout === 'layout9' ? themeColor : '#e5e7eb' }}></div>
                    <div className="h-2 w-1/2 bg-gray-200 rounded"></div>
                    <div className="h-2 w-full bg-gray-100 rounded"></div>
                    <div className="h-2 w-full bg-gray-100 rounded"></div>
                  </div>
                  
                  {/* Table Preview */}
                  <div className="border border-gray-100 rounded overflow-hidden mt-3">
                    <div className="h-3 flex items-center px-1" style={{ backgroundColor: themeColor, opacity: printLayout === 'layout5' || printLayout === 'layout10' ? 1 : 0.8 }}>
                      <div className="h-1 w-1/3 bg-white/50 rounded"></div>
                    </div>
                    <div className="h-3 border-t border-gray-100 flex items-center px-1">
                      <div className="h-1 w-1/4 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-3 border-t border-gray-100 flex items-center px-1">
                      <div className="h-1 w-1/2 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  
                  {/* Total Preview */}
                  <div 
                    className={`mt-4 flex justify-between items-center pt-2 ${
                      printLayout === 'layout2' || printLayout === 'layout7' ? 'border-t-2 border-dashed' : 'border-t border-solid'
                    }`}
                    style={{ borderColor: themeColor }}
                  >
                    <div className="h-2 w-8 bg-gray-200 rounded"></div>
                    <div className="h-3 w-12 rounded" style={{ backgroundColor: themeColor }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Theme Color</label>
                <input 
                  type="color" 
                  value={themeColor} 
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-full h-8 cursor-pointer rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Page Size</label>
                <select value={printPageSize} onChange={(e) => setPrintPageSize(e.target.value)} className="w-full text-xs border border-slate-300 rounded p-1.5">
                  <option value="A4">A4 (Regular)</option>
                  <option value="A5">A5 (Regular)</option>
                  <option value="80mm">80mm (Thermal)</option>
                  <option value="58mm">58mm (Thermal)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Text Size</label>
                <select value={printTextSize} onChange={(e) => setPrintTextSize(e.target.value)} className="w-full text-xs border border-slate-300 rounded p-1.5">
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <h3 className="text-xs font-bold text-slate-800 mb-2">Invoice Header / Company Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Company Name</label>
                  <input type="text" value={companyDetails.name} onChange={e => setCompanyDetails({...companyDetails, name: e.target.value})} className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Phone Number</label>
                  <input type="text" value={companyDetails.number} onChange={e => setCompanyDetails({...companyDetails, number: e.target.value})} className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Email</label>
                  <input type="text" value={companyDetails.email} onChange={e => setCompanyDetails({...companyDetails, email: e.target.value})} className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Address</label>
                  <input type="text" value={companyDetails.address} onChange={e => setCompanyDetails({...companyDetails, address: e.target.value})} className="w-full text-xs border border-slate-300 rounded p-1.5" />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" className="btn-primary text-xs">Save Print Settings</button>
            </div>
          </form>
        </div>
      )}



      {/* 4. Accounting Rules & Double-Counting Note Banner */}
      <div className="card p-4 bg-slate-50 border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-indigo-700">
          <InformationCircleIcon className="h-4 w-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Net Balance & Purchase Accounting Rules
          </h3>
        </div>
        <div className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-800">
            Formula:{' '}
            <span className="font-mono text-indigo-700">
              Net Balance = Previous Net Balance + Total Sales − Total Expenses − Supplier Payments − Dues Paid
            </span>
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1 text-[11px]">
            <li>
              <strong className="text-slate-800">Purchases Excluded from Sales:</strong> Purchases are money going out to suppliers and are never counted as revenue or added to Total Sales.
            </li>
            <li>
              <strong className="text-slate-800">Supplier Dues & Payments:</strong> When logging a purchase, cash paid is deducted as a supplier payment, while any unpaid balance is tracked as a supplier payable (due).
            </li>
            <li>
              <strong className="text-slate-800">No Double-Counting:</strong> Do not record fuel purchases under General Expenses. Supplier payments are subtracted directly from Net Balance to prevent double deduction.
            </li>
          </ul>
        </div>
      </div>

      {/* 5. Database Clear / Clean Slate */}
      <div className="card p-4 border border-rose-200 bg-rose-50/40 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-rose-700">
          <TrashIcon className="h-4 w-4" />
          <h2 className="text-sm font-bold">
            Wipe All Records & Reset Database (ڈیٹا بیس مکمل صاف کریں)
          </h2>
        </div>
        <p className="text-xs text-rose-800 leading-relaxed">
          If you want to clear out all previous test transactions, sales, expenses, and fuel readings so that all periods (Daily, 7 Days, Monthly, Yearly) are cleanly reset to zero and ready to save only fresh records.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={handleClearDatabase}
            disabled={clearing}
            className="btn-danger text-xs px-3.5 py-1.5 flex items-center gap-1.5"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {clearing ? 'Clearing Database...' : 'Clear All Database Records Now'}
          </button>
        </div>
      </div>

      {/* 6. User Profile */}
      <div className="card p-4 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
          <UserCircleIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">User Profile</h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Logged In Account</p>
            <p className="text-xs font-bold text-slate-800 mt-0.5">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="btn-danger text-xs self-start sm:self-auto"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-400 pt-2">
        Vyapar Business Management Dashboard v1.3.0
      </div>
    </div>
  );
}
