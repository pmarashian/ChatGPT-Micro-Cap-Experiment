# Auto Trader Admin Dashboard

A modern, mobile-first Progressive Web App (PWA) for monitoring and managing an automated trading system.

## Features

### Authentication

- ✅ User login/logout with secure session management
- ✅ Forgot password flow
- ✅ Account registration (local use only)

### Dashboard

- ✅ Portfolio overview with key metrics
- ✅ Daily and 7-day performance tracking
- ✅ System status monitoring
- ✅ Real-time job status updates

### Job Management

- ✅ View all system jobs with status and schedules
- ✅ Toggle jobs on/off
- ✅ Manual job scheduling (triggers immediate execution)
- ✅ Job execution history and next run times

### Technical Features

- ✅ **Next.js 15** with App Router
- ✅ **TypeScript** for type safety
- ✅ **Tailwind CSS** for responsive styling
- ✅ **Prisma ORM** with SQLite database
- ✅ **NextAuth.js** for authentication
- ✅ **PWA** capabilities with service worker
- ✅ **Mobile-first design** with fullscreen PWA support
- ✅ **Server components** preferred over client components

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up the database:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

3. Create an admin account:

```bash
# Start the dev server
npm run dev
```

4. Navigate to `/auth/signup` to create your first admin account

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Production Build

Build for production:

```bash
npm run build
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Create new user account
- `POST /api/auth/forgot-password` - Request password reset

### Jobs

- `GET /api/jobs` - Get all jobs
- `POST /api/jobs/[jobId]/toggle` - Enable/disable job
- `POST /api/jobs/[jobId]/run` - Schedule job to run immediately

### Portfolio

- `GET /api/portfolio` - Get portfolio data and metrics

## PWA Features

The app is configured as a PWA with:

- **Manifest file** for app installation
- **Service worker** for offline capabilities
- **Fullscreen mode** on mobile devices
- **Native app-like experience**

## Database Schema

### Users

- User authentication and session management
- Role-based access control

### Jobs

- Job definitions with schedules and status
- Job execution history and logs

### Sessions

- Secure session management for authentication

## Mobile Optimization

- **Mobile-first responsive design**
- **Touch-friendly interfaces**
- **Optimized for small screens**
- **PWA fullscreen mode**
- **Native app-like navigation**

## Architecture

- **Server Components**: Preferred for data fetching and rendering
- **Client Components**: Used only when necessary (forms, interactivity)
- **API Routes**: RESTful endpoints for data operations
- **Middleware**: Authentication and security

## Security

- **Secure authentication** with NextAuth.js
- **Password hashing** with bcrypt
- **Session management** with secure tokens
- **Input validation** and sanitization
- **Role-based access control**

## Next Steps

To integrate with your existing auto trader backend:

1. Update API endpoints to call your serverless functions
2. Replace mock data with real API calls
3. Add more detailed portfolio and job management features
4. Implement real-time updates using WebSockets or Server-Sent Events
5. Add email notifications and alerts

The app is designed to be easily extensible and can be customized to fit your specific trading system requirements.
