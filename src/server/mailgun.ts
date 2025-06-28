import Mailgun from "mailgun.js";
import FormData from "form-data";
import { env } from "~/env.js";
import { db } from "~/server/db";

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: env.MAILGUN_API_KEY as string,
});

export async function sendResetPasswordEmail(email: string, url: string, resetToken: string) {
  const resetUrl = url;

  console.log("resetUrl", resetUrl);
  console.log("resetToken", resetToken);
  
  const emailData = {
    from: env.FROM_EMAIL as string,
    to: email,
    subject: "Reset Your Password - WhatsApp Group Manager",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: #ffffff;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #25D366;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              font-weight: 600;
              color: #1a1a1a;
              margin: 0 0 10px 0;
            }
            .subtitle {
              color: #666;
              margin: 0 0 30px 0;
            }
            .content {
              margin-bottom: 30px;
            }
            .reset-button {
              display: inline-block;
              background-color: #25D366;
              color: #ffffff;
              text-decoration: none;
              padding: 14px 28px;
              border-radius: 6px;
              font-weight: 600;
              text-align: center;
              margin: 20px 0;
            }
            .reset-button:hover {
              background-color: #128C7E;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 30px;
              border-top: 1px solid #eee;
              font-size: 14px;
              color: #666;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              border-radius: 4px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📱 WhatsApp Group Manager</div>
              <h1 class="title">Reset Your Password</h1>
              <p class="subtitle">We received a request to reset your password</p>
            </div>
            
            <div class="content">
              <p>Hi there,</p>
              <p>You recently requested to reset your password for your WhatsApp Group Manager account. Click the button below to reset it:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="reset-button">Reset Your Password</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong> This password reset link will expire in 1 hour for your security. If you didn't request this password reset, please ignore this email or contact support if you have concerns.
              </div>
              
              <p>If the button above doesn't work, copy and paste the following URL into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">
                ${resetUrl}
              </p>
            </div>
            
            <div class="footer">
              <p>If you didn't request this password reset, you can safely ignore this email.</p>
              <p>This email was sent from WhatsApp Group Manager. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Reset Your Password - WhatsApp Group Manager
      
      Hi there,
      
      You recently requested to reset your password for your WhatsApp Group Manager account.
      
      Please use the following link to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour for your security.
      
      If you didn't request this password reset, please ignore this email.
      
      ---
      WhatsApp Group Manager
    `,
  };

  try {
    const response = await mg.messages.create(env.MAILGUN_DOMAIN as string, emailData);
    console.log("Reset password email sent successfully:", response);
    return { success: true, messageId: response.id };
  } catch (error) {
    console.error("Failed to send reset password email:", error);
    throw new Error("Failed to send reset password email");
  }
}

export async function sendPasswordChangedNotification(email: string) {
  const emailData = {
    from: env.FROM_EMAIL as string,
    to: email,
    subject: "Password Changed Successfully - WhatsApp Group Manager",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Changed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: #ffffff;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #25D366;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              font-weight: 600;
              color: #1a1a1a;
              margin: 0 0 10px 0;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .content {
              margin-bottom: 30px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 30px;
              border-top: 1px solid #eee;
              font-size: 14px;
              color: #666;
            }
            .info-box {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              border-radius: 4px;
              padding: 15px;
              margin: 20px 0;
              color: #155724;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📱 WhatsApp Group Manager</div>
              <div class="success-icon">✅</div>
              <h1 class="title">Password Changed Successfully</h1>
            </div>
            
            <div class="content">
              <p>Hi there,</p>
              <p>This email confirms that your password for your WhatsApp Group Manager account has been successfully changed.</p>
              
              <div class="info-box">
                <strong>✓ Password Updated:</strong> Your account is now secured with your new password.
              </div>
              
              <p>If you made this change, no further action is required. Your account remains secure.</p>
              
              <p><strong>Didn't make this change?</strong> If you did not request this password change, please contact our support team immediately as your account may have been compromised.</p>
            </div>
            
            <div class="footer">
              <p>For your security, we recommend using a strong, unique password.</p>
              <p>This email was sent from WhatsApp Group Manager. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Password Changed Successfully - WhatsApp Group Manager
      
      Hi there,
      
      This email confirms that your password for your WhatsApp Group Manager account has been successfully changed.
      
      If you made this change, no further action is required.
      
      If you did not request this password change, please contact our support team immediately.
      
      ---
      WhatsApp Group Manager
    `,
  };

  try {
    const response = await mg.messages.create(env.MAILGUN_DOMAIN as string, emailData);
    console.log("Password changed notification sent successfully:", response);
    return { success: true, messageId: response.id };
  } catch (error) {
    console.error("Failed to send password changed notification:", error);
    throw new Error("Failed to send password changed notification");
  }
}

export async function sendUserRegistrationNotificationToAdmin(userName: string, userEmail: string) {
  const emailData = {
    from: env.FROM_EMAIL as string,
    to: env.ADMIN_EMAIL as string,
    subject: "New User Registration - Approval Required",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New User Registration</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: #ffffff;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #25D366;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              font-weight: 600;
              color: #1a1a1a;
              margin: 0 0 10px 0;
            }
            .notification-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .content {
              margin-bottom: 30px;
            }
            .user-details {
              background-color: #e8f4fd;
              border: 1px solid #bee5eb;
              border-radius: 4px;
              padding: 15px;
              margin: 20px 0;
            }
            .user-detail {
              margin: 8px 0;
            }
            .action-button {
              display: inline-block;
              background-color: #25D366;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              margin: 10px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 30px;
              border-top: 1px solid #eee;
              font-size: 14px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📱 WhatsApp Group Manager</div>
              <div class="notification-icon">🔔</div>
              <h1 class="title">New User Registration</h1>
            </div>
            
            <div class="content">
              <p>Hello Admin,</p>
              <p>A new user has registered and is waiting for approval to access the WhatsApp Group Manager.</p>
              
              <div class="user-details">
                <div class="user-detail"><strong>Name:</strong> ${userName}</div>
                <div class="user-detail"><strong>Email:</strong> ${userEmail}</div>
                <div class="user-detail"><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</div>
              </div>
              
              <p>Please review this registration and approve or reject the user access as appropriate.</p>
              
              <div style="text-align: center;">
                <a href="${env.BETTER_AUTH_URL}/admin" class="action-button">
                  Go to Admin Dashboard
                </a>
              </div>
            </div>
            
            <div class="footer">
              <p>This notification was sent automatically from WhatsApp Group Manager.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      New User Registration - WhatsApp Group Manager
      
      Hello Admin,
      
      A new user has registered and is waiting for approval:
      
      Name: ${userName}
      Email: ${userEmail}
      Registration Date: ${new Date().toLocaleDateString()}
      
      Please review this registration in the admin dashboard.
      
      ---
      WhatsApp Group Manager
    `,
  };

  try {
    const response = await mg.messages.create(env.MAILGUN_DOMAIN as string, emailData);
    console.log("User registration notification sent successfully:", response);
    return { success: true, messageId: response.id };
  } catch (error) {
    console.error("Failed to send user registration notification:", error);
    throw new Error("Failed to send user registration notification");
  }
}

export async function sendWhatsAppNotificationToAdmin(userName: string, userEmail: string) {
  if (!env.ADMIN_PHONE_NUMBER) {
    throw new Error("Admin phone number not configured");
  }

  const admin = await db.user.findFirst({
    where: {
        role: "ADMIN",
    },
    select: {
        id: true,
    },
    });
    if (!admin) {
    throw new Error("No admin user found in the database");
    }
    const adminSession = await db.whatsAppSession.findFirst({
        where: {
            userId: admin.id,
        }
    });


  if (!adminSession) {
    throw new Error("No active WhatsApp session found for admin");
  }

  const message = `🔔 *New User Registration*

A new user has registered for WhatsApp Group Manager:

👤 *Name:* ${userName}
📧 *Email:* ${userEmail}
📅 *Date:* ${new Date().toLocaleDateString()}

Please review and approve this registration in the admin dashboard.

${env.BETTER_AUTH_URL}/admin`;

  try {
    const response = await fetch(`${env.WAHA_API_URL}/api/sendText`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'X-Api-Key': env.WAHA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatId: env.ADMIN_PHONE_NUMBER + '@c.us',
        text: message,
        session: adminSession.sessionName,
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to send WhatsApp message: ${response.statusText}`);
    }

    console.log("WhatsApp notification sent successfully to admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to send WhatsApp notification:", error);
    throw error;
  }
}

export async function notifyAdminOfNewRegistration(userName: string, userEmail: string) {
  const results = { whatsapp: false, email: false, errors: [] as string[] };

  try {
    await sendWhatsAppNotificationToAdmin(userName, userEmail);
    results.whatsapp = true;
    console.log("WhatsApp notification sent successfully");
  } catch (error) {
    console.log("WhatsApp notification failed, falling back to email:", error);
    results.errors.push(`WhatsApp failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    try {
        await sendUserRegistrationNotificationToAdmin(userName, userEmail);
        results.email = true;
        console.log("Email notification sent successfully");
    } catch (error) {
        console.error("Email notification also failed:", error);
        results.errors.push(`Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (!results.whatsapp && !results.email) {
    throw new Error(`Failed to send notifications: ${results.errors.join(', ')}`);
  }

  return results;
}
