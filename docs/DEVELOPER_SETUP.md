# Developer Setup Guide

This guide is for the **app developer/distributor** who manages the Shopify Partner account and provisions access for merchants.

## Overview

This app uses Shopify's **Custom Distribution** model:
- You (the developer) create and manage the app in your Partner account
- You generate install links for specific merchant stores
- You provide merchants with the Client ID and Client Secret
- Merchants install the app on their store and enter credentials in this desktop app

## One-Time Setup (Developer)

### 1. Create a Shopify Partner Account

1. Go to [shopify.com/partners](https://www.shopify.com/partners) and click **"Sign up"**
2. Complete the registration process

### 2. Create the App in Dev Dashboard

1. Go to [dev.shopify.com](https://dev.shopify.com) and log in
2. Click **"Apps"** in the sidebar
3. Click **"Create App"**
4. Enter an app name (e.g., "Inventory Tracker")
5. Click **"Create"**

### 3. Configure App Settings

1. Click **"Configuration"** in the sidebar
2. In the **"URLs"** section:
   - ❌ **Uncheck** "Embed app in Shopify admin"
3. In the **"Access"** section:
   - Add redirect URL: `http://localhost:3456/callback`
   - Add Admin API scopes: `read_orders`, `read_products`
4. Click **"Release"** at the top right
5. Click **"Release"** again in the confirmation dialog

### 4. Request Protected Customer Data Access

1. Go to [partners.shopify.com](https://partners.shopify.com) and log in
2. Click **"App Distribution"** in the left navigation
3. Click on your app name
4. Click **"API access requests"** in the left navigation
5. In **"Protected customer data access"**, click **"Request access"**

#### Step 1 - Select Data Access:
- Select **"Store management"**
- Click **"Save"**

#### Step 2 - Data Protection Details:
Click **"Provide details"** and answer:

| Section | Question | Answer |
|---------|----------|--------|
| **Purpose** | Process minimum personal data? | ✅ Yes |
| | Tell merchants what data you process? | ✅ Yes |
| | Limit use to that purpose? | ✅ Yes |
| **Consent** | Privacy agreements with merchants? | ✅ Yes |
| | Respect consent decisions? | ✅ Yes |
| | Respect opt-out of data selling? | ✅ Yes |
| | Opt-out for automated decisions? | ⚪ Not applicable |
| **Storage** | Retention periods? | ✅ Yes |
| | Encrypt at rest and transit? | ✅ Yes |

Click **"Save"**

### 5. Set Up Distribution

1. Still in Partners Dashboard → App Distribution → your app
2. Click **"Choose distribution"** (or **"Distribution"** in sidebar)
3. Select **"Custom distribution"**
4. For each merchant, enter their store domain and generate an install link

### 6. Get Credentials

1. Go to [dev.shopify.com](https://dev.shopify.com)
2. Click on your app
3. Click **"Overview"** in the sidebar
4. Copy the **Client ID**
5. Click **"Client secret"** → **"Show secret"** and copy it

## Per-Merchant Setup

For each new merchant:

1. **Generate Install Link**: In Partners Dashboard → App Distribution → your app, enter the merchant's store domain and generate an install link
2. **Share with Merchant**:
   - The install link
   - The Client ID
   - The Client Secret
   - Download link for the desktop app
3. **Merchant Steps**:
   - Click the install link to add the app to their Shopify store
   - Download and run the desktop app
   - Enter the Client ID and Client Secret
   - Enter their store URL and click "Connect to Shopify"
   - Authorize the app in the browser popup

## Testing

Run the test suite before releasing:
```bash
npm test
```

Tests run automatically in GitHub Actions on PRs and before builds.

## Development/Debug Mode

When running in development mode, you can skip the setup wizard by creating a `.env` file:

```env
SHOPIFY_CLIENT_ID=your_client_id_here
SHOPIFY_CLIENT_SECRET=your_client_secret_here
SHOPIFY_STORE_URL=your-store.myshopify.com
```

The app will automatically use these values and skip the setup wizard.

## Security Notes

- Client credentials are stored locally on each user's machine
- The Client Secret should be transmitted securely to merchants (not in plain email)
- Each merchant's access token is stored only on their local machine
- The app uses HTTPS for all Shopify API calls
