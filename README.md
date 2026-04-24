# OEO - Kindergarten Employee Punch System

A comprehensive employee time tracking system for kindergartens, built with React and Firebase.

## Features

- **Real-time Punch-in System**: Employees can clock in/out using their phone numbers
- **Leave Management**: Track and manage employee leave requests
- **Admin Dashboard**: Comprehensive management interface for administrators
- **Duplicate Detection**: Prevents accidental duplicate clock-ins
- **Audit Logging**: Cloud Functions for logging and anomaly detection
- **Analytics**: Integrated with Vercel Web Analytics for usage insights

## Tech Stack

- **Frontend**: React 18 with Vite
- **Backend**: Firebase (Firestore, Cloud Functions, Authentication)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Analytics**: Vercel Web Analytics

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Firebase project set up

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linter
pnpm lint
```

### Environment Variables

The application expects the following global variables (typically injected during deployment):

- `__firebase_config`: Firebase configuration object
- `__app_id`: Application identifier
- `__initial_auth_token`: Optional initial authentication token

### Deployment

This project is configured to deploy on Vercel with Firebase backend services.

1. Connect your repository to Vercel
2. Configure Firebase environment variables in Vercel project settings
3. Deploy!

## Project Structure

```
.
├── functions/          # Firebase Cloud Functions
│   └── index.js       # Audit logging and notification functions
├── src/
│   ├── App.jsx        # Main application component
│   ├── main.jsx       # Application entry point
│   ├── index.css      # Global styles
│   └── utils/
│       └── punchDetection.js  # Punch validation utilities
├── index.html         # HTML entry point
├── vite.config.js     # Vite configuration
├── tailwind.config.js # Tailwind CSS configuration
└── package.json       # Dependencies and scripts
```

## Analytics

This project uses Vercel Web Analytics to track:
- Page views
- User interactions
- Performance metrics

Analytics data is viewable in the Vercel dashboard after deployment.

## License

Private project - All rights reserved
