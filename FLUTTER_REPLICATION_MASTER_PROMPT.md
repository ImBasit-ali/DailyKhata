# Vyapar Business Management Suite — Flutter (Windows & Android) Blueprint & Master Prompt

> **Purpose:** This document provides the complete architectural blueprint, database schema, business logic, UI design system, state management, and an exhaustive **Master Prompt** to generate a production-grade **Flutter application (supporting Windows desktop and Android mobile/tablet)** that perfectly replicates the Vyapar web application.

---

## 1. Executive Summary & Tech Stack Specification

| Domain | Web Application (Reference) | Target Flutter Application |
| :--- | :--- | :--- |
| **Framework** | React 19 + Vite + Tailwind CSS | Flutter 3.x (Dart 3.x) |
| **Platforms** | Modern Browsers | **Windows (.exe) & Android (.apk / AAB)** |
| **Backend / DB** | Supabase (PostgreSQL 15, Auth, RLS, Views) | `supabase_flutter: ^2.8.0` |
| **State Management** | React Context (`AuthContext`, `CompanyContext`) | `flutter_riverpod: ^2.6.1` or `provider: ^6.1.2` |
| **Local Storage** | `localStorage` (Categories, Trash, Blacklist) | `shared_preferences: ^2.3.3` or `hive_flutter: ^1.1.0` |
| **Spreadsheet / Excel** | `exceljs` | `excel: ^4.0.6` or `syncfusion_flutter_xlsio` |
| **Print & PDF** | `window.print()` + CSS `@media print` | `pdf: ^3.11.1` + `printing: ^5.13.2` |
| **Charts** | Recharts (Area, Bar) | `fl_chart: ^0.70.0` |
| **Icons** | Heroicons React | `heroicons: ^0.10.0` or `fluentui_system_icons` |
| **Typography** | Inter font, Urdu Nastaliq / Arabic font fallback | `google_fonts: ^6.2.1` (`Inter`, `NotoNastaliqUrdu`) |

---

## 2. Supabase Cloud Configuration & Database Schema

### 2.1 Supabase Credentials
```dart
const String supabaseUrl = 'https://qwdhtuaofiibtreycyae.supabase.co';
const String supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZGh0dWFvZmlpYnRyZXljeWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzc1NjEsImV4cCI6MjEwMzgxMzU2MX0.MPklU1K9PtXAep32de0VI2kTddpgeCOe8KHpu3yUyHs';
```

### 2.2 Tables & PostgreSQL Structure

#### 1. `companies`
- `id` (UUID, Primary Key, `DEFAULT gen_random_uuid()`)
- `user_id` (UUID, References `auth.users.id`)
- `name` (TEXT NOT NULL) — e.g., `"Gill Filling Station"`, `"Gill Bricks Company"`
- `phone` (TEXT)
- `email` (TEXT)
- `address` (TEXT)
- `created_at` (TIMESTAMPTZ)

#### 2. `customers` (Parties / Accounts)
- `id` (UUID, Primary Key, `DEFAULT gen_random_uuid()`)
- `company_id` (UUID, References `companies.id` ON DELETE CASCADE)
- `name` (TEXT NOT NULL) — Party full name
- `code` (TEXT NOT NULL) — Short unique identifier (auto-generated in background, e.g., `"P102"`)
- `created_at` (TIMESTAMPTZ)
- *Note:* In PostgreSQL schema, `customers.category` does not natively exist. The app stores and resolves the party's category (*Regular, Commercial / Wholesale, Supplier, Staff / Employee, VIP / Govt, Other*) persistently via local cache (`customerCategoryManager`).

#### 3. `ledger_entries`
- `id` (UUID, Primary Key)
- `company_id` (UUID, References `companies.id`)
- `customer_id` (UUID, References `customers.id`)
- `date` (DATE NOT NULL)
- `detail` (TEXT) — Description of transaction / voucher
- `credit_amount` (NUMERIC(12,2) DEFAULT 0) — **جمع (Credit given / Udhaar)**
- `cash_advance` (NUMERIC(12,2) DEFAULT 0) — **پیشگی وصولی (Cash advance / payment received)**
- `created_at` (TIMESTAMPTZ)

#### 4. `customer_ledger_with_balance` (PostgreSQL Database View)
Computes running balance automatically per party:
$$\text{running\_balance} = \sum (\text{credit\_amount} - \text{cash\_advance}) \quad \text{ordered by } date, created\_at$$

#### 5. `cash_transactions` (Sales, Advances, Dues, Purchases)
- `id` (UUID, Primary Key)
- `company_id` (UUID)
- `customer_id` (UUID, Nullable — null for cash walk-in)
- `date` (DATE)
- `tx_type` (TEXT / ENUM: `'sale'`, `'cash_advance'`, `'due_payment'`, `'purchase'`)
- `amount` (NUMERIC(12,2) NOT NULL)
- `is_credit` (BOOLEAN DEFAULT false) — `true` if credit (ادھار), `false` if cash (نقد)
- `description` (TEXT)
- `created_at` (TIMESTAMPTZ)

#### 6. `expenses`
- `id` (UUID, Primary Key)
- `company_id` (UUID)
- `date` (DATE)
- `customer_code` (TEXT, Nullable) — Holds Firm Code (e.g. `"BC"`, `"FS"`)
- `name` (TEXT NOT NULL) — Stores `"[Category] Description"` e.g., `"[Salaries] Staff Parvez"` to ensure database-level category persistence even without a native column
- `amount` (NUMERIC(12,2) NOT NULL)
- `created_at` (TIMESTAMPTZ)

#### 7. `fuel_inventory` & `fuel_inventory_with_balances` (View)
- `id` (UUID, Primary Key)
- `company_id` (UUID)
- `date` (DATE)
- `fuel_type` (TEXT: `'petrol'` or `'diesel'`)
- `sold` (NUMERIC(12,2) NOT NULL) — Liters sold
- `rate_per_liter` (NUMERIC(12,2) NOT NULL)
- `sales_amount` (NUMERIC(12,2)) — Explicitly stored as $\text{sold} \times \text{rate\_per\_liter}$
- **Database View fields:** `opening_balance`, `purchased` (from `fuel_purchases`), `sold`, `rate_per_liter`, `sales_amount`, `closing_balance`.

#### 8. `fuel_purchases`
- `id` (UUID, Primary Key)
- `company_id` (UUID)
- `date` (DATE)
- `fuel_type` (`'petrol'` | `'diesel'`)
- `supplier_name` (TEXT)
- `quantity_liters` (NUMERIC(12,2))
- `price_per_liter` (NUMERIC(12,2))
- `total_cost` (NUMERIC(12,2)) — Auto-computed: $\text{quantity} \times \text{price}$

---

## 3. Core Business Logic & Rules Engine

### 3.1 Firm / Company Code Generation Rule
When companies are listed, filtered, or selected in Expenses, the short code is auto-computed via:
1. Normalize and clean the company name.
2. If there are $\ge 3$ words, **skip the first similar prefix word** (e.g., *"Gill"*), take the 1st letter of the 2nd word and the 1st letter of the 3rd word.
   - *Example:* `"Gill Bricks Company"` $\rightarrow$ **`BC`** (*Bricks*, *Company*)
   - *Example:* `"Gill Filling Station"` $\rightarrow$ **`FS`** (*Filling*, *Station*)
   - *Example:* `"Gill Petroleum Service"` $\rightarrow$ **`PS`** (*Petroleum*, *Service*)
   - *Example:* `"Gill Lubricants Store"` $\rightarrow$ **`LS`** (*Lubricants*, *Store*)
3. If 2 words without prefix: `"Bricks Company"` $\rightarrow$ **`BC`**.

### 3.2 Fuel Sales Calculation
$$\text{Sales Amount} = \text{Sold Liters} \times \text{Rate Per Liter}$$
- Fuel sales are counted directly into Total Revenue.
- The inventory table maintains daily Opening Balance, Purchased Liters, Sold Liters, Rate/L, Total Sales Amount, and Closing Balance.

### 3.3 Strict Financial Net Balance Formula
$$\begin{aligned}
\text{Total Sales} &= \text{Fuel Sales} + \text{General Sales} + \text{Advance Payments Received} \\
\text{Total Expenses} &= \sum \text{Expenses (incl. Salaries, Rent, Utilities, etc.)} \\
\text{Supplier Payments} &= \sum \text{Paid amounts to Fuel/Product Suppliers} \\
\text{Customer Dues Settled} &= \sum \text{Due Payments received} \\
\text{Net Balance} &= \text{Previous Balance} + \text{Total Sales} - \text{Total Expenses} - \text{Supplier Payments} - \text{Customer Dues Settled}
\end{aligned}$$
> [!IMPORTANT]
> **Strict Purchases Rule:** Purchases are never counted as sales/revenue. A purchase is tracked as either an expense/cash-out or a supplier due (payable).

### 3.4 Serial Numbers (`S.N.`) & Removal of Party Codes
- Every transaction table across all screens (**Sales**, **Customer Ledger**, **Expenses**, **Fuel Inventory**, **Fuel Purchases**) features a sequential **`S.N.`** column (`1, 2, 3, ...`) as the first column.
- The Party Code field is **completely removed** from user-facing forms. When adding a party, the user enters only the **Party Name** and **Category**. Short codes are handled automatically in the background.

### 3.5 Double-Layered Persistent Categories
To ensure that Party and Expense categories are never lost:
- **Parties:** Supported categories: `Regular`, `Commercial / Wholesale`, `Supplier`, `Staff / Employee`, `VIP / Govt`, `Other`. Cached locally by ID and auto-fallback.
- **Expenses:** Supported categories: `Salaries`, `Utilities (Electricity, Gas, Water)`, `Rent`, `Repairs & Maintenance`, `Fuel & Generator`, `Tea & Refreshment`, `Office Supplies`, `Legal & Accounting`, `Marketing`, `Taxes`, `General & Misc`. The category is prepended to the database `name` field as `"[Category] Description"` and parsed back to clean presentation.

### 3.6 Permanent Deletion & Trash Bin Architecture
- **Soft Delete / Trash Bin:** When deleting items, they are moved to a Trash Bin with timestamp and metadata, allowing single or bulk restore.
- **Permanent Deletion:** When permanently deleted, records are removed from Supabase and blacklisted in a persistent manager (`deletedRecordsManager`) to ensure un-scoped database views never leak deleted rows.
- **Database Wipe:** A dedicated Settings feature enables a complete database wipe/reset.

---

## 4. Screens & User Interface Specifications

### 4.1 Global Layout & Theme System
- **Color Palette:**
  - Primary: Indigo (`#4F46E5`, `#4338CA`, `#EEF2FF`)
  - Emerald / Success: (`#10B981`, `#059669`, `#ECFDF5`)
  - Rose / Danger / Expense: (`#F43F5E`, `#E11D48`, `#FFF1F2`)
  - Amber / Warning / Fuel: (`#F59E0B`, `#D97706`, `#FFFBEB`)
  - Slate Background & Borders: (`#F8FAFC`, `#E2E8F0`, `#64748B`, `#0F172A`)
- **Desktop (Windows):** Persistent collapsible sidebar on the left, top navigation with company selector dropdown, high data density tables with sticky headers.
- **Mobile (Android):** Collapsible drawer, responsive stacked cards / scrollable tables, floating action buttons.
- **Typography:** Compact, tabular figures (`tabular-nums`) for currency and numbers.

### 4.2 Screens Overview

#### 1. Authentication (`/auth`)
- Email & Password sign-in / sign-up.
- Professional fintech-styled card with Vyapar branding.
- Persistent session handling.

#### 2. Dashboard (`/`)
- Company selector dropdown (Specific company OR "All Companies").
- Period filter tabs: **Daily**, **7 Days**, **Monthly**, **Yearly**, **Custom Date Range**.
- Stat Cards: Total Sales, Total Expenses, Fuel Stock, Net Cash Balance (with Previous Balance indicator).
- Interactive Charts: Revenue vs. Expense Trends, Fuel Stock levels.
- Recent activity tables.

#### 3. Companies Management (`/companies`)
- List of companies with Firm Code badge (e.g. `[BC]`, `[FS]`).
- Add / Edit Company dialog with live real-time Firm Code generation preview.
- Active company switcher.

#### 4. Parties & Ledger (`/customers` & `/customers/:id/ledger`)
- **Parties List:** `S.N.`, `Company Code` (if All Companies), `Party Name`, `Category Badge`, `Running Balance (بقایا)`, `Actions`.
- Top Filter: `All Party Categories` dropdown.
- **Add Party Button:** Prominently launches modal with Party Name and Category selection.
- **Party Ledger View:** Full chronological statement showing `S.N.`, `Date`, `Detail`, `Credit (جمع)`, `Cash Advance (پیشگی)`, and `Running Balance (بقایا)`. Summary cards for Total Credit, Total Advances, and Net Balance.

#### 5. Sales & Advances (`/sales`)
- Table: `S.N.`, `Date`, `Company Code`, `Type Badge` (*Sale, Advance, Due Payment, Purchase*), `Payment Mode` (*Cash vs. Credit*), `Party Name + Category`, `Description`, `Amount`, `Actions`.
- Modal: Allows recording Sale, Cash Advance, Due Payment, or Purchase.
- **Inline Party Addition:** Prominent **`+ Add Party`** button right next to the party dropdown to create parties on-the-fly without leaving the form.
- Full PDF / Print Sales Statement view matching thermal/A4 invoice specifications.

#### 6. Fuel Inventory (`/fuel`)
- Tabs: **Petrol** | **Diesel**.
- Daily inventory table: `S.N.`, `Date`, `Company Code`, `Opening Balance (L)`, `Purchased (L)`, `Sold (L)`, `Rate / L`, `Sales Amount (Rs = Sold × Rate)`, `Closing Balance (L)`, `Actions`.
- Add Day Entry dialog with live auto-calculated total sales amount.

#### 7. Fuel Purchases (`/fuel/purchases`)
- Log fuel tanker arrivals: `Date`, `Fuel Type`, `Supplier`, `Quantity (L)`, `Price / L`, `Total Cost`, `Amount Paid`, `Due Balance`.
- Supplier payment status badges (*Paid*, *Partial*, *Due*).

#### 8. Expenses (`/expenses`)
- Table: `S.N.`, `Date`, `Company Code`, `Category Badge`, `Firm Code`, `Description`, `Amount`, `Actions`.
- Top Filter: Filter by Category, Filter by Firm Code (`BC — Gill Bricks Company`).
- Modal: Category selector, Party / Payee selector with **`+ Add Party`** button, Firm Code auto-selection, Description, Amount.

#### 9. Reports & Excel Export (`/reports`)
- Comprehensive period-filtered profit & loss, fuel volume breakdown, expense distribution, and customer balances.
- Export to formatted multi-sheet Excel (.xlsx) workbooks with colored headers and formula-based totals.

#### 10. Settings & Database Management (`/settings`)
- Set **Previous Net Balance** for individual companies or across all companies.
- Initial stock configurations for Petrol and Diesel.
- **Trash Bin Manager:** View deleted records, restore individually or in bulk, or permanently delete.
- **Database Reset:** Single-click wipe and clean slate function.

#### 11. Transaction Toolbar & Context Menus
- Standard toolbar on every table: Quick text search, Graph toggle, Export to Excel, Print table.
- Row Action Menu (3-dots and right-click context menu): View / Edit, Print Voucher, Share / Copy, Duplicate record, Move to Trash.

---

## 5. Master Prompt for AI Model (Flutter Code Generation)

Copy and paste the prompt below into an advanced AI model (e.g. Gemini 1.5 Pro, Claude 3.5 Sonnet, GPT-4o) to generate the complete Flutter application:

```text
You are an expert Principal Flutter & Dart Engineer. Build a production-grade, pixel-perfect, cross-platform Flutter application for Windows (Desktop) and Android (Mobile/Tablet) named "Vyapar Business Suite".

This application must replicate the exact UI, business logic, architecture, and features of the reference Vyapar business ledger and fuel management web system.

### 1. TECH STACK & PACKAGES
Use the latest stable Flutter 3.x and Dart 3.x with the following pubspec.yaml dependencies:
- supabase_flutter: ^2.8.0
- flutter_riverpod: ^2.6.1 (State Management)
- shared_preferences: ^2.3.3 (Local persistence)
- fl_chart: ^0.70.0 (Interactive charts)
- excel: ^4.0.6 (Excel import/export)
- pdf: ^3.11.1 & printing: ^5.13.2 (Invoice and report printing)
- intl: ^0.19.0 (Formatting currency & dates)
- google_fonts: ^6.2.1 (Inter font)
- flutter_spinkit: ^5.2.1 (Loaders)

### 2. SUPABASE CONNECTION
Connect directly to Supabase using:
- URL: https://qwdhtuaofiibtreycyae.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZGh0dWFvZmlpYnRyZXljeWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzc1NjEsImV4cCI6MjEwMzgxMzU2MX0.MPklU1K9PtXAep32de0VI2kTddpgeCOe8KHpu3yUyHs

### 3. ESSENTIAL ARCHITECTURE & BUSINESS RULES

1. MULTI-COMPANY ARCHITECTURE:
   - Each user can have multiple companies (companies table: id, name, phone, email, address).
   - Top bar provides a Company Dropdown with an option for "All Companies" or a specific company.
   - All database queries filter by active company_id, or company_id IN (allCompanyIds) when "All Companies" is selected.

2. FIRM CODE ALGORITHM:
   - For any company name, generate a short Firm Code by skipping the first common prefix word (e.g., "Gill") and taking the 1st letters of the 2nd and 3rd words.
   - Example: "Gill Bricks Company" -> "BC", "Gill Filling Station" -> "FS", "Gill Petroleum Service" -> "PS".
   - When "All Companies" is selected, tables display this Firm Code badge in the Company column instead of the long company name.

3. SERIAL NUMBER (S.N.) ON EVERY TRANSACTION:
   - All tables (Sales, Customer Ledger, Expenses, Fuel Inventory, Fuel Purchases) MUST have sequential S.N. (1, 2, 3, ...) as the very first column.

4. REMOVAL OF PARTY CODES:
   - In Party/Customer forms, DO NOT show a Party Code input. The user only enters Name and Category. Generate code automatically in the background (e.g. 'P' + random/initials) to satisfy NOT NULL constraints.
   - In tables, headers, and dropdowns, show only Party Name and Category badge (e.g. "Parvez Khan — Regular").

5. DOUBLE-LAYERED CATEGORY PERSISTENCE:
   - Party Categories: Regular, Commercial / Wholesale, Supplier, Staff / Employee, VIP / Govt, Other.
   - Expense Categories: Salaries, Utilities (Electricity, Gas, Water), Rent, Repairs & Maintenance, Fuel & Generator, Tea & Refreshment, Office Supplies, Legal & Accounting, Marketing, Taxes, General & Misc.
   - In Supabase, the expenses and customers tables lack native category columns. For expenses, store the category prepended to the name field as "[Category] Description" and save locally by ID. When reading, parse out the clean description and category badge.

6. REVENUE & FINANCIAL FORMULAS:
   - Fuel Sales = Sold Liters * Rate Per Liter (stored explicitly as sales_amount in fuel_inventory).
   - Total Sales = Fuel Sales + General Counter Sales + Cash Advance Payments.
   - Purchases are strictly cash out / supplier payables, NEVER counted as sales.
   - Net Balance = Previous Balance (from Settings) + Total Sales - Total Expenses (incl. Salaries) - Supplier Payments - Customer Dues Settled.

7. INLINE "+ ADD PARTY" BUTTON:
   - In both the Sales/Advances modal and Expenses modal, include a prominent "+ Add Party" button right next to the party dropdown. Clicking it opens a quick modal to create a party and auto-selects it upon creation without losing existing form input.

8. TRANSACTION TOOLBAR & CONTEXT MENUS:
   - Include a toolbar above tables containing: Search Bar, Graph Toggle, Excel Export Button, Print Button.
   - Include a 3-dots action button and right-click context menu on table rows with: View / Edit, Print Voucher, Copy Details, Duplicate, Move to Trash.

9. TRASH & RESTORE SYSTEM:
   - Deleted items are moved to a local/Supabase Trash store with original JSON payload.
   - The Settings screen has a Trash Management tab allowing multi-selection restore, single restore, and permanent deletion.

10. RESPONSIVE DESKTOP & MOBILE UI:
    - On Windows desktop: fixed dark/slate sidebar navigation, top header with company selector, compact tables with sticky headers, dialog popups.
    - On Android: bottom navigation or collapsible drawer, responsive data cards / horizontal scrolling tables, modal bottom sheets for entry forms.

Generate clean, idiomatic, and complete Dart/Flutter code files organized in a modular structure:
- lib/models/ (Company, Party, Transaction, Expense, FuelEntry, Purchase)
- lib/services/ (SupabaseService, StorageService, ExcelExportService, PdfPrintService)
- lib/providers/ (AuthNotifier, CompanyNotifier, TransactionNotifier)
- lib/views/dashboard/
- lib/views/customers/
- lib/views/sales/
- lib/views/fuel/
- lib/views/expenses/
- lib/views/reports/
- lib/views/settings/
- lib/widgets/ (TransactionToolbar, RowActionsMenu, QuickAddPartyDialog, StatCard, ResponsiveLayout)
```

---

## 6. Detailed Implementation Guide for Windows & Android

### 6.1 Responsive Architecture (`ResponsiveLayout.dart`)
```dart
import 'package:flutter/material.dart';

class ResponsiveLayout extends StatelessWidget {
  final Widget desktopLayout;
  final Widget mobileLayout;

  const ResponsiveLayout({
    Key? key,
    required this.desktopLayout,
    required this.mobileLayout,
  }) : super(key: key);

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= 1024;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 1024) {
          return desktopLayout;
        }
        return mobileLayout;
      },
    );
  }
}
```

### 6.2 Company / Firm Code Utility (`company_utils.dart`)
```dart
class CompanyUtils {
  static String getCompanyCode(String? companyName) {
    if (companyName == null || companyName.trim().isEmpty) return '-';
    
    final clean = companyName.replaceAll(RegExp(r'[^a-zA-Z0-9\s]'), '').trim();
    final words = clean.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    
    if (words.isEmpty) return '-';
    if (words.length == 1) return words[0].substring(0, words[0].length.clamp(1, 2)).toUpperCase();
    
    // If >= 3 words, skip the first word (e.g. 'Gill') and take 1st letters of 2nd and 3rd words
    if (words.length >= 3) {
      final w2 = words[1];
      final w3 = words[2];
      return '${w2[0]}${w3[0]}'.toUpperCase();
    }
    
    // 2 words
    final w1 = words[0];
    final w2 = words[1];
    if (w1.toLowerCase() == 'gill' && w2.length >= 2) {
      return w2.substring(0, 2).toUpperCase();
    }
    return '${w1[0]}${w2[0]}'.toUpperCase();
  }
}
```

### 6.3 Expense Category Manager (`expense_category_manager.dart`)
```dart
class ExpenseCategoryManager {
  static String formatStoredName(String category, String description) {
    final cleanDesc = description.replaceFirst(RegExp(r'^\[.*?\]\s*'), '').trim();
    return '[$category] $cleanDesc';
  }

  static Map<String, String> parseStoredName(String? rawName) {
    if (rawName == null || rawName.trim().isEmpty) {
      return {'category': 'General & Misc', 'name': ''};
    }
    
    final match = RegExp(r'^\[(.*?)\]\s*(.*)$').firstMatch(rawName);
    if (match != null) {
      return {
        'category': match.group(1) ?? 'General & Misc',
        'name': match.group(2) ?? '',
      };
    }
    return {'category': 'General & Misc', 'name': rawName};
  }
}
```

---

## 7. Delivery & Execution Checkpoints

1. **Database Parity:** Confirm connection to Supabase instance, with automated column fallbacks for `category` and explicit `sales_amount` calculations on fuel.
2. **UI Density & Typography:** Match the desktop compact table heights, sticky headers, and tabular numeral alignment.
3. **Printing & Export:** Provide native thermal/A4 voucher print preview and `.xlsx` generation with automatic total calculations.
4. **Android Readiness:** Ensure all dialogs and modals gracefully adapt to touchscreens via scrollable bottom sheets.
