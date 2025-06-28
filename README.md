# 📱 WhatsApp Group Manager

A powerful web application built with the T3 Stack to manage WhatsApp groups and schedule messages efficiently. This application allows you to create message campaigns, schedule them for specific times, and automatically send them to your WhatsApp groups.

## ✨ Features

- 🔐 **Secure Authentication** - User authentication and authorization with password reset
- 📧 **Email Password Reset** - Secure password reset via email using Mailgun
- 📊 **Campaign Management** - Create and manage message campaigns
- ⏰ **Message Scheduling** - Schedule messages for specific dates and times
- 🤖 **Automated Sending** - Background service that automatically sends scheduled messages
- 📈 **Campaign Analytics** - Track campaign status and completion
- 🎯 **Group Management** - Manage multiple WhatsApp groups
- 📱 **Responsive Design** - Works perfectly on desktop and mobile

## 🚀 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) with [Prisma](https://prisma.io/)
- **Email Service**: [Mailgun](https://www.mailgun.com/) for password reset emails
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Type Safety**: [TypeScript](https://www.typescriptlang.org/)
- **API**: [tRPC](https://trpc.io/)
- **Package Manager**: [pnpm](https://pnpm.io/)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- Node.js 18+ 
- pnpm
- MongoDB database
- WhatsApp Web API Server (WAHA)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jevil25/whatsapp-waha-dashboard.git
   cd whatsapp-waha-dashboard
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following content:
   ```env
   # Database
   DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/whatsapp-manager" 

   # WhatsApp API
   WAHA_API_URL="http://localhost:3000"
   WAHA_API_KEY="your-waha-api-key" 
   
   # Better Auth
   BETTER_AUTH_SECRET="your-better-auth-secret"
   BETTER_AUTH_URL="http://localhost:3000"
   
   # Mailgun (for password reset emails)
   MAILGUN_API_KEY="your-mailgun-api-key"
   MAILGUN_DOMAIN="your-mailgun-domain"
   FROM_EMAIL="noreply@yourdomain.com"
   ```

4. **Generate Prisma client**
   ```bash
   pnpm prisma:generate
   ```

5. **Push database schema**
   ```bash
   pnpm db:push
   ```

6. **Start the development server**
   ```bash
   pnpm dev
   ```

Visit [https://whatsapp-groups-manager.vercel.app/](https://whatsapp-groups-manager.vercel.app/) to see your application running!

## � Screenshots & How It Works

### 🔗 Connect Your WhatsApp
Start by connecting your WhatsApp account to the system. Scan the QR code with your WhatsApp mobile app.

![Connect WhatsApp](screenshots/connect_whatsapp.png)

### 📱 QR Code Scanning
Use your WhatsApp mobile app to scan the QR code and establish the connection.

![QR Code Scan](screenshots/qr%20code%20scan%20view.png)

### ✅ Connected Dashboard
Once connected, you can see your WhatsApp session status and manage your campaigns.

![Connected Dashboard](screenshots/connected%20and%20campaign%20view.png)

### � WhatsApp Groups View
View and manage all your connected WhatsApp groups in one place.

![WhatsApp Groups View](screenshots/whatsapps_group_view.png)

### �📝 Schedule Messages
Create and schedule messages for your WhatsApp groups with an easy-to-use form.

![Schedule Message Form](screenshots/schedule%20message%20form.png)

### 👑 Admin Dashboard
Manage all aspects of your WhatsApp campaigns from the comprehensive admin dashboard.

![Admin Dashboard](screenshots/admin%20dashboard.png)

![Admin Dashboard 2](screenshots/admin%20dashbaord%202.png)

## �📊 How It Works

### 1. Authentication & Setup
Users can sign up and authenticate to access the dashboard where they can manage their WhatsApp campaigns.

### 2. Campaign Creation
Create message campaigns by:
- Selecting target WhatsApp groups
- Writing your message content
- Setting the schedule date and time
- Configuring campaign settings

### 3. Automated Message Delivery
The background scheduler service:
- Checks for pending messages every 30 seconds
- Automatically sends messages when scheduled time arrives
- Updates campaign status and tracking information
- Handles errors and retry logic

## 🚀 Deployment

### Vercel Deployment

1. **Push your code to GitHub**

2. **Connect to Vercel**
   - Visit [Vercel](https://vercel.com/)
   - Import your GitHub repository
   - Configure environment variables in Vercel dashboard

3. **Environment Variables for Vercel**
   ```env
  DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/whatsapp-manager
  BETTER_AUTH_SECRET=your-production-secret
  BETTER_AUTH_URL=https://your-app.vercel.app
  WAHA_API_KEY=your-waha-api-key
  WAHA_BASE_URL=http://your-waha-server:3000
   ```

4. **Deploy**
   - Vercel will automatically build and deploy your application
   - Your app will be available at `https://your-app.vercel.app`

### DigitalOcean VPS Setup for Message Scheduler

The message scheduler needs to run continuously on a server. Here's how to set it up on a DigitalOcean VPS:

#### 1. Create a DigitalOcean Droplet

[**Get $200 in credits with this referral link!**](https://m.do.co/c/ddd03661770c)

- Choose Ubuntu 22.04 LTS
- Select at least 1GB RAM droplet
- Add your password (as its easier for beginners, but SSH keys are recommended)

#### 2. Server Setup

```bash
# Connect to your server
ssh root@your-server-ip
(enter your password or use your SSH key)

# Update system
apt update && apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2 for process management
npm install -g pm2
```

#### 3. Deploy Your Scheduler

```bash
# Clone your repository
git clone https://github.com/yourusername/whatsapp-group-manager.git
cd whatsapp-group-manager

# Install dependencies
pnpm install

# Create production environment file
nano .env.production

# Add your environment variables
DATABASE_URL="your-mongodb-connection-string"
WAHA_API_KEY="your-waha-api-key"
WAHA_BASE_URL="http://your-waha-server:3000"

# Generate Prisma client
pnpm prisma:generate

# Start the scheduler with PM2
pm2 start src/scripts/messageScheduler.ts \
  --interpreter ./node_modules/.bin/tsx \
  --name whatsapp-scheduler \
  --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

#### 4. Monitor Your Scheduler

```bash
# Check status
pm2 status

# View logs
pm2 logs whatsapp-scheduler

# Restart if needed
pm2 restart whatsapp-scheduler
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | MongoDB connection string | ✅ |
| `BETTER_AUTH_SECRET` | Secret key for Better Auth | ✅ |
| `BETTER_AUTH_URL` | Base URL for your application | ✅ |
| `WAHA_API_KEY` | API key for WhatsApp API | ✅ |
| `WAHA_API_URL` | Base URL for WAHA server | ✅ |
| `MAILGUN_API_KEY` | Mailgun API key for sending emails | ✅ |
| `MAILGUN_DOMAIN` | Mailgun domain for sending emails | ✅ |
| `FROM_EMAIL` | Email address to send from | ✅ |

## 📝 Available Scripts

```bash
# Development
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm start                  # Start production server

# Database
pnpm db:push               # Push schema to database
pnpm db:studio             # Open Prisma Studio
pnpm prisma:generate       # Generate Prisma client

# Message Scheduler
pnpm scheduler:start       # Start message scheduler locally

# Code Quality
pnpm lint                  # Run ESLint
pnpm lint:fix             # Fix ESLint issues
pnpm typecheck            # Run TypeScript check
pnpm format:check         # Check code formatting
pnpm format:write         # Format code
```

## 🏗️ Project Structure

```
src/
├── app/                   # Next.js app directory
│   ├── _components/       # Reusable components
│   ├── api/              # API routes
│   ├── auth/             # Authentication pages
│   └── admin/            # Admin dashboard
├── scripts/              # Background scripts
│   └── messageScheduler.ts # Message scheduling service
├── server/               # Server-side code
│   ├── api/              # tRPC routers
│   ├── auth.ts           # Authentication config
│   └── db.ts             # Database connection
├── styles/               # Global styles
└── trpc/                 # tRPC configuration
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Aaron Nazareth**

- 🐙 GitHub: [@jevil25](https://github.com/jevil25)
- 📺 YouTube: [@JevilCodes](https://youtube.com/@JevilCodes)
- 🐦 X: [@jevil257](https://x.com/jevil257)

---

<div align="center">
  Made with ❤️ by Aaron Nazareth
</div>

