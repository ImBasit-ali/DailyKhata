-- =============================================
-- Vyapar: Multi-Company Ledger & Fuel Inventory
-- Supabase Postgres Schema + RLS Policies
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUM TYPES
-- =============================================
CREATE TYPE fuel_type_enum AS ENUM ('petrol', 'diesel');
CREATE TYPE transaction_type_enum AS ENUM ('sale', 'purchase', 'cash_advance', 'due_payment');

-- =============================================
-- TABLE: companies
-- =============================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_user_id ON public.companies(user_id);

-- =============================================
-- TABLE: customers
-- =============================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,  -- short code like "P", "S", "SK", "B"
  category TEXT NOT NULL DEFAULT 'Regular', -- e.g. Regular, Commercial, Supplier, Staff, VIP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

CREATE INDEX idx_customers_company_id ON public.customers(company_id);
CREATE INDEX idx_customers_category ON public.customers(category);

-- =============================================
-- TABLE: ledger_entries
-- Running balance is COMPUTED via view, not stored
-- =============================================
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  detail TEXT,
  credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- جمع (credit given)
  cash_advance NUMERIC(12, 2) NOT NULL DEFAULT 0,     -- cash paid ahead
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_entries_company_id ON public.ledger_entries(company_id);
CREATE INDEX idx_ledger_entries_customer_id ON public.ledger_entries(customer_id);
CREATE INDEX idx_ledger_entries_date ON public.ledger_entries(date);

-- =============================================
-- TABLE: fuel_inventory
-- opening_balance and closing_balance are COMPUTED via view
-- purchased is aggregated from fuel_purchases via view
-- =============================================
CREATE TABLE public.fuel_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  fuel_type fuel_type_enum NOT NULL,
  sold NUMERIC(12, 2) NOT NULL DEFAULT 0,           -- liters sold
  rate_per_liter NUMERIC(10, 2) NOT NULL DEFAULT 0, -- price per liter (changes daily)
  sales_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- sold * rate_per_liter
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, date, fuel_type)
);

CREATE INDEX idx_fuel_inventory_company_id ON public.fuel_inventory(company_id);
CREATE INDEX idx_fuel_inventory_date ON public.fuel_inventory(date);
CREATE INDEX idx_fuel_inventory_fuel_type ON public.fuel_inventory(fuel_type);

-- =============================================
-- TABLE: fuel_initial_stock
-- Stores the starting balance for each fuel type per company
-- =============================================
CREATE TABLE public.fuel_initial_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fuel_type fuel_type_enum NOT NULL,
  initial_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, fuel_type)
);

CREATE INDEX idx_fuel_initial_stock_company ON public.fuel_initial_stock(company_id);

-- =============================================
-- TABLE: fuel_purchases (arrivals)
-- =============================================
CREATE TABLE public.fuel_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  fuel_type fuel_type_enum NOT NULL,
  supplier_name TEXT NOT NULL,
  quantity_liters NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_per_liter NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- quantity * price
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fuel_purchases_company_id ON public.fuel_purchases(company_id);
CREATE INDEX idx_fuel_purchases_date ON public.fuel_purchases(date);

-- =============================================
-- TABLE: expenses
-- =============================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'General', -- e.g. Salaries, Utilities, Rent, Repairs, etc.
  customer_code TEXT,  -- short code for grouping (matches customer codes)
  name TEXT NOT NULL,  -- expense description
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_company_id ON public.expenses(company_id);
CREATE INDEX idx_expenses_date ON public.expenses(date);
CREATE INDEX idx_expenses_category ON public.expenses(category);
CREATE INDEX idx_expenses_customer_code ON public.expenses(customer_code);

-- =============================================
-- TABLE: cash_transactions
-- =============================================
CREATE TABLE public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tx_type transaction_type_enum NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_credit BOOLEAN NOT NULL DEFAULT false,  -- true = ادھار (credit), false = cash
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_transactions_company_id ON public.cash_transactions(company_id);
CREATE INDEX idx_cash_transactions_date ON public.cash_transactions(date);
CREATE INDEX idx_cash_transactions_customer_id ON public.cash_transactions(customer_id);

-- =============================================
-- VIEW: customer_ledger_with_balance
-- Computes running balance using window functions
-- balance = cumulative(credit_amount) - cumulative(cash_advance)
-- =============================================
CREATE OR REPLACE VIEW public.customer_ledger_with_balance AS
SELECT
  le.id,
  le.company_id,
  le.customer_id,
  le.date,
  le.detail,
  le.credit_amount,
  le.cash_advance,
  SUM(le.credit_amount - le.cash_advance) 
    OVER (
      PARTITION BY le.company_id, le.customer_id 
      ORDER BY le.date, le.created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance,
  le.created_at,
  le.updated_at
FROM public.ledger_entries le;

-- =============================================
-- VIEW: fuel_inventory_with_balances
-- Computes opening/closing balances using window functions
-- Aggregates purchases from fuel_purchases table
-- =============================================
CREATE OR REPLACE VIEW public.fuel_inventory_with_balances AS
WITH daily_purchases AS (
  SELECT 
    company_id, 
    date, 
    fuel_type, 
    COALESCE(SUM(quantity_liters), 0) AS total_purchased
  FROM public.fuel_purchases
  GROUP BY company_id, date, fuel_type
),
initial_stocks AS (
  SELECT 
    company_id, 
    fuel_type, 
    initial_balance, 
    effective_date
  FROM public.fuel_initial_stock
),
inventory_calc AS (
  SELECT
    fi.id,
    fi.company_id,
    fi.date,
    fi.fuel_type,
    COALESCE(dp.total_purchased, 0) AS purchased,
    fi.sold,
    fi.rate_per_liter,
    fi.sales_amount,
    COALESCE(ist.initial_balance, 0) AS initial_stock,
    COALESCE(ist.effective_date, fi.date) AS stock_start_date,
    fi.created_at,
    fi.updated_at,
    -- Cumulative net change = sum of (purchased - sold) from start up to current row
    SUM(COALESCE(dp.total_purchased, 0) - fi.sold) 
      OVER (
        PARTITION BY fi.company_id, fi.fuel_type 
        ORDER BY fi.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_net
  FROM public.fuel_inventory fi
  LEFT JOIN daily_purchases dp 
    ON fi.company_id = dp.company_id 
    AND fi.date = dp.date 
    AND fi.fuel_type = dp.fuel_type
  LEFT JOIN initial_stocks ist
    ON fi.company_id = ist.company_id
    AND fi.fuel_type = ist.fuel_type
)
SELECT
  ic.id,
  ic.company_id,
  ic.date,
  ic.fuel_type,
  -- Opening balance = initial_stock + cumulative_net up to PREVIOUS row
  COALESCE(
    ic.initial_stock + LAG(ic.cumulative_net) 
      OVER (PARTITION BY ic.company_id, ic.fuel_type ORDER BY ic.date),
    ic.initial_stock
  ) AS opening_balance,
  ic.purchased,
  ic.sold,
  ic.rate_per_liter,
  ic.sales_amount,
  -- Closing balance = initial_stock + cumulative_net up to CURRENT row
  (ic.initial_stock + ic.cumulative_net) AS closing_balance,
  ic.created_at,
  ic.updated_at
FROM inventory_calc ic;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Helper function for checking company ownership
CREATE OR REPLACE FUNCTION public.user_owns_company(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = target_company_id
      AND user_id = (SELECT auth.uid())
  );
$$;

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_initial_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- =====================
-- Companies policies
-- =====================
CREATE POLICY "Users can view own companies"
  ON public.companies FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create companies"
  ON public.companies FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own companies"
  ON public.companies FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own companies"
  ON public.companies FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- =====================
-- Customers policies
-- =====================
CREATE POLICY "Users can view customers of own companies"
  ON public.customers FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create customers in own companies"
  ON public.customers FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update customers in own companies"
  ON public.customers FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete customers in own companies"
  ON public.customers FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Ledger entries policies
-- =====================
CREATE POLICY "Users can view ledger entries of own companies"
  ON public.ledger_entries FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create ledger entries in own companies"
  ON public.ledger_entries FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update ledger entries in own companies"
  ON public.ledger_entries FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete ledger entries in own companies"
  ON public.ledger_entries FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Fuel inventory policies
-- =====================
CREATE POLICY "Users can view fuel inventory of own companies"
  ON public.fuel_inventory FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create fuel inventory in own companies"
  ON public.fuel_inventory FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update fuel inventory in own companies"
  ON public.fuel_inventory FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete fuel inventory in own companies"
  ON public.fuel_inventory FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Fuel initial stock policies
-- =====================
CREATE POLICY "Users can view fuel initial stock of own companies"
  ON public.fuel_initial_stock FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create fuel initial stock in own companies"
  ON public.fuel_initial_stock FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update fuel initial stock in own companies"
  ON public.fuel_initial_stock FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete fuel initial stock in own companies"
  ON public.fuel_initial_stock FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Fuel purchases policies
-- =====================
CREATE POLICY "Users can view fuel purchases of own companies"
  ON public.fuel_purchases FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create fuel purchases in own companies"
  ON public.fuel_purchases FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update fuel purchases in own companies"
  ON public.fuel_purchases FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete fuel purchases in own companies"
  ON public.fuel_purchases FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Expenses policies
-- =====================
CREATE POLICY "Users can view expenses of own companies"
  ON public.expenses FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create expenses in own companies"
  ON public.expenses FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update expenses in own companies"
  ON public.expenses FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete expenses in own companies"
  ON public.expenses FOR DELETE
  USING (public.user_owns_company(company_id));

-- =====================
-- Cash transactions policies
-- =====================
CREATE POLICY "Users can view cash transactions of own companies"
  ON public.cash_transactions FOR SELECT
  USING (public.user_owns_company(company_id));

CREATE POLICY "Users can create cash transactions in own companies"
  ON public.cash_transactions FOR INSERT
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can update cash transactions in own companies"
  ON public.cash_transactions FOR UPDATE
  USING (public.user_owns_company(company_id))
  WITH CHECK (public.user_owns_company(company_id));

CREATE POLICY "Users can delete cash transactions in own companies"
  ON public.cash_transactions FOR DELETE
  USING (public.user_owns_company(company_id));

-- =============================================
-- TRIGGER: Auto-update updated_at timestamp
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_ledger_entries_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_fuel_inventory_updated_at
  BEFORE UPDATE ON public.fuel_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_fuel_purchases_updated_at
  BEFORE UPDATE ON public.fuel_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_cash_transactions_updated_at
  BEFORE UPDATE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
