# JesDanPay Email Templates

This directory contains the custom HTML templates for JesDanPay's transactional emails.

## Applying Templates in Supabase

Supabase does not sync email templates from the codebase automatically. You must manually copy and paste the contents of these HTML files into the Supabase Dashboard:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Open your project
3. Navigate to **Authentication** > **Email Templates**
4. For **Confirm Signup**:
   - Paste the contents of `confirm-email.html` into the "Message body" (ensure you select HTML mode if available, or just paste the raw HTML).
   - Set the subject to: `Confirm your JesDanPay account`
5. For **Reset Password**:
   - Paste the contents of `reset-password.html` into the "Message body".
   - Set the subject to: `Reset your JesDanPay password`

## KYC Status Emails

In Milestone 1, there is no automated email triggered when a KYC status changes (as approval is currently a manual database update). When Milestone 2 wires in an automated KYC provider and an email service (like Resend or Postmark), you can use these same HTML structures for "KYC Approved" and "KYC Rejected" notifications.
