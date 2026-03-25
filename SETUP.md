# Oshali Fuel Distribution Management System - Setup Guide

## Initial Setup

### Step 1: Create Super Admin Account

To create the initial super admin account, follow these steps:

1. Open `setup-admin.html` in your web browser
2. Click the "Create Super Admin" button
3. Wait for confirmation

**Super Admin Credentials:**
- Email: `super@oshali.com`
- Password: `super123`

### Step 2: Sign In

1. Navigate to the application (usually `http://localhost:5173` in development)
2. Sign in with the super admin credentials above

### Step 3: Create Other Users

Once signed in as super admin:

1. Navigate to the **Users** page from the sidebar
2. Click **Add User** button
3. Fill in the user details:
   - Full Name
   - Email
   - Password (minimum 6 characters)
   - Role (select from dropdown)

## Available User Roles

### Super Admin
- Full system access
- Can create and manage all users
- Access to all modules and features

### General Manager
- View all operations
- Set fuel pricing
- Approve and allocate goods received
- View all reports and dashboards

### Finance
- Create and manage Purchase Orders
- Generate Goods Received documents
- Edit Purchase Requisitions
- View financial reports

### Administrator
- Access to most modules
- Can assist with operations
- View reports

### Operations Supervisor
- Create Purchase Requisitions
- Allocate goods to inventory tanks
- Create sales invoices
- Manage day-to-day operations
- Mobile-optimized interface

### Pump Attendant
- Create sales invoices
- Manage client information
- Record vehicle details
- Mobile-optimized interface

## System Features

### Procurement
- **Purchase Requisitions (PR)**: Operations creates requests for fuel
- **Purchase Orders (PO)**: Finance converts approved PRs to POs
- **Goods Received (GR)**: Finance documents received fuel after payment

### Inventory Management
- Three tanks (A, B, C) with 23,000L capacity each
- Animated tank visualizations
- FIFO (First-In-First-Out) tracking
- Cost tracking per GR batch

### Sales
- Invoice creation with delivery notes
- Client and vehicle management
- Automatic FIFO allocation
- Real-time profit calculations

### Pricing
- General Manager sets selling price
- Historical pricing records
- Namibian Dollar (N$) currency

## Security

- All data protected with Row Level Security (RLS)
- Role-based access control
- Secure authentication via Supabase

## Support

For issues or questions, contact your system administrator.
