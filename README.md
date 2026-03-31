# AI-Powered Dispute Resolution Platform

A full-stack web application for online dispute resolution (ODR) powered by AI. The platform enables parties to file, manage, and resolve disputes through AI-assisted mediation guided by Indian Constitutional principles.

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![React](https://img.shields.io/badge/React-19.x-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![Express](https://img.shields.io/badge/Express-5.x-lightgrey)
![License](https://img.shields.io/badge/License-ISC-yellow)

---

## 🚀 Features

### Core Dispute Resolution
- **Dispute Filing** — Submit cases with plaintiff/respondent details, descriptions, and supporting evidence
- **AI-Powered Mediation** — Google Gemini AI analyzes disputes and generates fair resolution recommendations based on Indian Constitutional law
- **Real-time Messaging** — Socket.io powered communication between parties within each dispute
- **Evidence Management** — Upload documents with OCR processing via Tesseract.js for automatic text extraction
- **Resolution Workflow** — Structured multi-step process: filing → party review → AI analysis → agreement signing
- **PDF Reports** — Auto-generated case summaries and settlement agreements via PDFKit
- **Case History** — Complete timeline and activity log for every dispute

### AI & Intelligence
- **RAG-Powered Legal Analysis** — Retrieval-Augmented Generation using a seeded Indian legal knowledge base for contextually accurate mediation
- **Conversation Memory** — AI maintains context across interactions using conversation summaries
- **Case Profiling** — Automated case categorization and risk assessment
- **Re-analysis Support** — Parties can request AI re-evaluation with updated information
- **Court Escalation** — Option to forward unresolved disputes to appropriate legal authorities

### User Management
- **JWT Authentication** — Secure token-based login with httpOnly cookie support
- **Email Verification** — Account activation via email verification link
- **Password Recovery** — Forgot/reset password flow via email
- **User Profiles** — Profile picture upload (Cloudinary), privacy settings, and account statistics
- **Session Management** — View active sessions and revoke access from other devices
- **Notification Preferences** — Configurable notification settings per user
- **GDPR Compliance** — Export personal data and delete account

### Notifications
- **Real-time Bell Notifications** — In-app notification system with unread counts
- **Email Notifications** — Automatic email alerts for dispute updates via Nodemailer
- **Socket-based Updates** — Instant push via WebSocket when disputes change state

### Admin Panel
- **Admin Dashboard** — Platform statistics, system health, recent activity, and pending actions
- **User Management** — View all users, update roles, suspend/activate accounts, delete users
- **Activity Monitoring** — Per-user activity logs for oversight
- **Contact/Support** — View and reply to user support messages
- **Audit Logging** — Comprehensive action tracking for compliance and accountability

### Identity Verification
- **OCR ID Verification** — Upload government ID documents for automated identity verification via Tesseract.js
- **External Verification API** — Standalone endpoint for ID document verification

### Security
- **Helmet.js** — Security headers and Content Security Policy
- **Rate Limiting** — Configurable rate limits with Redis-backed store support
- **Input Validation** — express-validator for request sanitization
- **XSS Protection** — Cross-site scripting prevention middleware
- **Secret Validation** — Startup validation of required environment secrets
- **Sentry Integration** — Error tracking and performance monitoring (backend + frontend)
- **Audit Trail** — All critical actions are logged with timestamps, users, and context

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express 5 | REST API server |
| PostgreSQL + Sequelize | Database & ORM |
| Umzug | Database migrations |
| Socket.io | Real-time WebSocket communication |
| Google Generative AI (Gemini) | AI-powered mediation & legal analysis |
| Tesseract.js | OCR for document & ID verification |
| Cloudinary | Profile picture & media storage |
| Nodemailer | Email notifications |
| PDFKit | PDF report generation |
| Winston + Daily Rotate | Structured logging with rotation |
| Sentry | Error monitoring & performance |
| Helmet / express-rate-limit | Security middleware |
| Redis (ioredis) | Rate limiting backend (optional) |

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + Vite | UI framework & build tool |
| React Router 7 | Client-side routing |
| Tailwind CSS 3 | Utility-first styling |
| Framer Motion | Animations & transitions |
| Lucide React | Icon library |
| Socket.io Client | Real-time updates |
| react-hot-toast | Toast notifications |
| react-signature-canvas | Digital signature capture |
| i18next | Internationalization support |
| Sentry React | Frontend error tracking |
| Axios | HTTP client |

---

## 📁 Project Structure

```
AI-Mediator/
├── backend/
│   ├── src/
│   │   ├── server.js                  # Express server & startup
│   │   ├── config/
│   │   │   ├── db.js                  # PostgreSQL/Sequelize config
│   │   │   ├── cloudinary.js          # Cloudinary config
│   │   │   ├── migrator.js            # Umzug migration runner
│   │   │   └── validator.js           # Environment secret validation
│   │   ├── controllers/
│   │   │   ├── authController.js      # Register, login, password reset
│   │   │   ├── disputeController.js   # Dispute CRUD, AI analysis, evidence
│   │   │   ├── userController.js      # Profile, sessions, privacy
│   │   │   ├── adminController.js     # User mgmt, dashboard stats
│   │   │   ├── notificationController.js
│   │   │   ├── externalController.js  # OCR ID verification
│   │   │   └── statsController.js     # Platform statistics
│   │   ├── models/
│   │   │   ├── User.js               # User accounts & roles
│   │   │   ├── Dispute.js            # Dispute cases
│   │   │   ├── Message.js            # Chat messages
│   │   │   ├── Evidence.js           # Uploaded evidence
│   │   │   ├── Notification.js       # User notifications
│   │   │   ├── AuditLog.js           # Audit trail
│   │   │   ├── Session.js            # User sessions
│   │   │   ├── Contact.js            # Support messages
│   │   │   ├── ConversationSummary.js # AI conversation memory
│   │   │   └── LegalKnowledge.js     # RAG knowledge base
│   │   ├── routes/
│   │   │   ├── authRoutes.js          # /api/auth/*
│   │   │   ├── disputeRoutes.js       # /api/disputes/*
│   │   │   ├── userRoutes.js          # /api/users/*
│   │   │   ├── adminRoutes.js         # /api/admin/*
│   │   │   ├── notificationRoutes.js  # /api/notifications/*
│   │   │   ├── externalRoutes.js      # /api/external/*
│   │   │   └── statsRoutes.js         # /api/stats
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js      # JWT auth & admin guard
│   │   │   ├── security.js           # Validation & sanitization
│   │   │   ├── rateLimiter.js        # Rate limiting config
│   │   │   ├── upload.js             # Multer file upload config
│   │   │   └── asyncHandler.js       # Async error wrapper
│   │   ├── services/
│   │   │   ├── aiService.js          # Gemini AI integration
│   │   │   ├── ragService.js         # RAG legal knowledge retrieval
│   │   │   ├── legalPrompts.js       # Constitutional law prompts
│   │   │   ├── memoryService.js      # Conversation memory
│   │   │   ├── caseProfileService.js # Case profiling & risk assessment
│   │   │   ├── ocrService.js         # Document OCR processing
│   │   │   ├── ocrIdVerification.js  # ID card verification
│   │   │   ├── socketService.js      # WebSocket management
│   │   │   ├── notificationService.js # Notification dispatch
│   │   │   ├── auditService.js       # Audit logging
│   │   │   ├── sessionService.js     # Session tracking
│   │   │   ├── logger.js            # Winston logger config
│   │   │   ├── sentryService.js      # Sentry error tracking
│   │   │   ├── email/               # Email templates & service
│   │   │   ├── report/              # PDF report generation
│   │   │   ├── smsService.js        # SMS notifications (Twilio)
│   │   │   └── paymentService.js    # Payment processing
│   │   └── scripts/
│   │       ├── db-migrate.js         # Run migrations
│   │       └── db-revert.js          # Revert migrations
│   ├── uploads/                       # Uploaded files
│   ├── logs/                          # Application logs
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                    # Root component & routing
│   │   ├── main.jsx                   # Entry point
│   │   ├── api.js                     # Axios API client
│   │   ├── components/
│   │   │   ├── NotificationBell.jsx   # Real-time notifications
│   │   │   ├── ConnectionStatus.jsx   # WebSocket status indicator
│   │   │   ├── EvidenceSection.jsx    # Evidence upload & management
│   │   │   ├── ResolutionProgress.jsx # Resolution step tracker
│   │   │   ├── RespondentAcceptance.jsx # Dispute acceptance flow
│   │   │   ├── CaseHistory.jsx        # Dispute timeline
│   │   │   ├── ActivityLog.jsx        # User activity feed
│   │   │   ├── AccountStatistics.jsx  # User stats dashboard
│   │   │   ├── ProfilePictureUpload.jsx
│   │   │   ├── PrivacySettings.jsx    # GDPR data controls
│   │   │   ├── TwoFactorAuth.jsx      # 2FA setup (QR code)
│   │   │   ├── ErrorBoundary.jsx      # React error boundary
│   │   │   └── Modal.jsx             # Reusable modal
│   │   ├── context/
│   │   │   ├── SocketContext.jsx      # WebSocket provider
│   │   │   └── NotificationContext.jsx # Notification state
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx        # Public landing page
│   │   │   ├── Login.jsx             # Login & registration
│   │   │   ├── Dashboard.jsx         # Main dispute dashboard
│   │   │   ├── NewDispute.jsx        # Create dispute form
│   │   │   ├── DisputeDetail.jsx     # Full dispute view & interaction
│   │   │   ├── Profile.jsx          # User profile management
│   │   │   ├── AdminDashboard.jsx    # Admin overview
│   │   │   ├── AdminUsers.jsx        # Admin user management
│   │   │   ├── EmailVerification.jsx # Email verify page
│   │   │   ├── ForgotPassword.jsx    # Password recovery
│   │   │   ├── ResetPassword.jsx     # Password reset form
│   │   │   └── Verification.jsx      # ID verification page
│   │   ├── constants/
│   │   │   └── socketEvents.js       # Socket event constants
│   │   └── utils/
│   │       └── fileHelpers.js        # File utility functions
│   ├── public/
│   └── package.json
│
├── OCR/                               # OCR microservice (Python)
├── services/                          # Additional microservices
├── scripts/
│   └── start.sh                       # Startup script
├── docs/                              # Documentation assets
├── docker-compose.yml                 # PostgreSQL container
└── README.md
```

---

## ⚙️ Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **PostgreSQL** 15+ (or Docker)
- **Google AI API Key** (for Gemini AI mediation)
- **Cloudinary Account** (for media uploads)
- **SMTP Server** (for email notifications)

---

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/AI-Mediator.git
cd AI-Mediator
```

### 2. Start PostgreSQL (using Docker)

```bash
docker-compose up -d
```

### 3. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/dispute_db
DB_POOL_MAX=10
DB_POOL_MIN=2

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-64-chars

# Admin Credentials
ADMIN_EMAIL=admin@dispute.com
ADMIN_PASSWORD=Admin@13

# Google AI (Gemini)
GOOGLE_AI_API_KEY=your-google-ai-api-key

# Cloudinary (Media Uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@aimediator.com

# Sentry (optional)
SENTRY_DSN=your-sentry-dsn

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

Start the backend:

```bash
npm run dev
```

### 4. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/` (if needed):

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

### 5. Access the Application

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/health |

---

## 📜 Available Scripts

### Backend

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with Node.js `--watch` |
| `npm run db:migrate` | Run database migrations |
| `npm run db:revert` | Revert last migration |

### Frontend

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## 📖 API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register` | Register new user |
| `POST` | `/login` | User login |
| `GET` | `/verify-email/:token` | Verify email address |
| `POST` | `/resend-verification` | Resend verification email |
| `POST` | `/forgot-password` | Request password reset |
| `POST` | `/reset-password` | Reset password with token |
| `POST` | `/logout` | Logout (invalidate session) |

### Disputes (`/api/disputes`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/` | Create new dispute |
| `GET` | `/` | List user's disputes |
| `GET` | `/:id` | Get dispute details |
| `POST` | `/:id/respond` | Respondent accepts/responds |
| `GET` | `/:id/messages` | Get chat messages |
| `POST` | `/:id/messages` | Send message (with optional attachment) |
| `POST` | `/:id/evidence` | Upload evidence document |
| `GET` | `/:id/evidence` | List evidence |
| `GET` | `/:id/evidence/:eid/download` | Download evidence file |
| `GET` | `/:id/evidence/:eid/preview` | Preview evidence |
| `DELETE` | `/:id/evidence/:eid` | Delete evidence |
| `GET` | `/:id/evidence/:eid/ocr` | Get OCR text from evidence |
| `POST` | `/:id/decision` | Submit AI analysis decision |
| `POST` | `/:id/verify-details` | Verify party details |
| `POST` | `/:id/sign` | Sign settlement agreement |
| `POST` | `/:id/resolution-viewed` | Mark resolution as viewed |
| `GET` | `/:id/report/summary` | Get case report summary |
| `GET` | `/:id/report/agreement` | Download agreement PDF |
| `POST` | `/:id/request-reanalysis` | Request AI re-analysis |
| `POST` | `/:id/force-ai-analysis` | Force AI analysis |
| `GET` | `/:id/history` | Get dispute activity history |

### User (`/api/users`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Get user profile |
| `PUT` | `/profile` | Update profile |
| `POST` | `/profile-picture` | Upload profile picture |
| `DELETE` | `/profile-picture` | Remove profile picture |
| `POST` | `/change-password` | Change password |
| `GET` | `/my-disputes` | Get user's disputes |
| `GET` | `/notification-preferences` | Get notification settings |
| `PUT` | `/notification-preferences` | Update notification settings |
| `GET` | `/export-data` | Export personal data (GDPR) |
| `DELETE` | `/account` | Delete account |
| `GET` | `/sessions` | List active sessions |
| `DELETE` | `/sessions/:id` | Revoke a session |

### Notifications (`/api/notifications`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Get notifications |
| `PUT` | `/:id/read` | Mark notification as read |
| `PUT` | `/mark-all-read` | Mark all as read |
| `DELETE` | `/:id` | Delete notification |

### Admin (`/api/admin`) — *Requires Admin role*
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard/stats` | Platform statistics |
| `GET` | `/dashboard/activity` | Recent activity |
| `GET` | `/dashboard/pending` | Pending actions |
| `GET` | `/dashboard/health` | System health |
| `GET` | `/users` | List all users |
| `PUT` | `/users/:id/role` | Update user role |
| `POST` | `/users/:id/suspend` | Suspend user |
| `POST` | `/users/:id/activate` | Activate user |
| `GET` | `/users/:id/activity` | User activity log |
| `DELETE` | `/users/:id` | Delete user |
| `GET` | `/contacts` | View support messages |
| `PUT` | `/contacts/:id/reply` | Reply to support message |

### External (`/api/external`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ocr/verify` | Verify ID document via OCR |

---

## 🐳 Docker

Start PostgreSQL database:

```bash
docker-compose up -d
```

Stop:

```bash
docker-compose down
```

Remove volumes (⚠️ deletes all data):

```bash
docker-compose down -v
```

---

## 🔐 Environment Variables

### Backend — Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT tokens (min 64 chars) |
| `GOOGLE_AI_API_KEY` | Google Gemini API key |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email (SMTP) configuration |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary media storage |

### Backend — Optional

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `5000`) |
| `NODE_ENV` | Environment (`development` / `production`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Default admin credentials |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `FRONTEND_URL` | Frontend URL for CORS |
| `DB_POOL_MAX`, `DB_POOL_MIN` | Connection pool settings |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the ISC License.

---

## 👥 Authors

- **Yaswanth** — *Initial work*

---

## 🙏 Acknowledgments

- [Google Generative AI (Gemini)](https://ai.google.dev/) for AI-powered mediation
- [Tesseract.js](https://tesseract.projectnaptha.com/) for OCR document processing
- [Cloudinary](https://cloudinary.com/) for media management
- The open-source community for the amazing tools and libraries
