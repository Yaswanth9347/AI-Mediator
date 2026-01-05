# AI-Powered Dispute Resolution Platform

A full-stack web application for online dispute resolution (ODR) powered by AI. The platform enables parties to file, manage, and resolve disputes through AI-assisted mediation based on Indian Constitutional principles.

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![React](https://img.shields.io/badge/React-19.x-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![License](https://img.shields.io/badge/License-ISC-yellow)

---

## 🚀 Features

### Core Functionality
- **Dispute Filing** - Submit cases with plaintiff/respondent details, descriptions, and evidence
- **AI-Powered Mediation** - Google Gemini AI analyzes disputes and suggests resolutions based on Indian Constitutional law
- **Real-time Communication** - Socket.io powered messaging between parties
- **Evidence Management** - Upload and OCR processing of documents using Tesseract.js
- **PDF Reports** - Auto-generated case reports and settlement agreements

### User Features
- **User Authentication** - JWT-based secure login with password reset via email
- **Two-Factor Authentication (2FA)** - Enhanced account security with QR code setup
- **User Profiles** - Profile picture upload, privacy settings, account statistics
- **Notifications** - Real-time bell notifications for case updates
- **Case History** - Complete timeline and activity log for each dispute

### Payment & Admin
- **Stripe Integration** - Secure payment processing for dispute filing fees
- **Admin Dashboard** - User management for administrators
- **Audit Logging** - Comprehensive action tracking for compliance

### Security
- **Helmet.js** - Security headers and CSP
- **Rate Limiting** - Protection against brute force and DDoS
- **Input Validation** - express-validator for sanitization
- **XSS Protection** - Cross-site scripting prevention
- **Sentry Integration** - Error tracking and monitoring

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express 5 | REST API server |
| PostgreSQL + Sequelize | Database & ORM |
| Socket.io | Real-time WebSocket communication |
| Google Generative AI (Gemini) | AI-powered mediation |
| Tesseract.js | OCR for document processing |
| Nodemailer | Email notifications |
| Stripe | Payment processing |
| Winston | Structured logging |
| Sentry | Error monitoring |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 + Vite | UI framework & build tool |
| React Router 7 | Client-side routing |
| Tailwind CSS | Styling |
| Framer Motion | Animations |
| Lucide React | Icons |
| Socket.io Client | Real-time updates |
| Stripe React | Payment UI components |

---

## 📁 Project Structure

```
AI-Mediator/
├── backend/
│   ├── src/
│   │   ├── server.js           # Main Express server
│   │   ├── config/
│   │   │   └── db.js           # PostgreSQL/Sequelize config
│   │   ├── middleware/
│   │   │   └── security.js     # Security middleware
│   │   └── services/
│   │       ├── auditService.js       # Audit logging
│   │       ├── emailService.js       # Email notifications
│   │       ├── logger.js             # Winston logger
│   │       ├── notificationService.js # Push notifications
│   │       ├── paymentService.js     # Stripe integration
│   │       └── sentryService.js      # Error tracking
│   ├── uploads/                # Uploaded evidence files
│   ├── logs/                   # Application logs
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main app component
│   │   ├── api.js              # API client
│   │   ├── components/         # Reusable UI components
│   │   ├── context/            # React context (Socket)
│   │   └── pages/              # Page components
│   ├── public/
│   └── package.json
│
├── docker-compose.yml          # PostgreSQL container
├── start.sh                    # Startup script
└── README.md
```

---

## ⚙️ Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **PostgreSQL** 15+ (or Docker)
- **Stripe Account** (for payments)
- **Google AI API Key** (for Gemini)
- **SMTP Server** (for emails)

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

Create `.env` file in `backend/`:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=dispute_db

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-64-chars

# Google AI (Gemini)
GOOGLE_AI_API_KEY=your-google-ai-api-key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@aimediator.com

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

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

Create `.env` file in `frontend/` (if needed):

```env
VITE_API_URL=http://localhost:5000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

Start the frontend:

```bash
npm run dev
```

### 5. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000

---

## 📜 Available Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with hot reload |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## 🔐 Environment Variables

### Backend Required Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret key for JWT tokens (min 64 chars) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `GOOGLE_AI_API_KEY` | Google Gemini API key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email configuration |

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

Remove volumes (⚠️ deletes data):

```bash
docker-compose down -v
```

---

## 📖 API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `POST /api/forgot-password` - Request password reset
- `POST /api/reset-password` - Reset password with token

### Disputes
- `GET /api/disputes` - Get user's disputes
- `POST /api/disputes` - Create new dispute
- `GET /api/disputes/:id` - Get dispute details
- `POST /api/disputes/:id/messages` - Send message
- `POST /api/disputes/:id/respond` - Respond to dispute
- `POST /api/disputes/:id/ai-analysis` - Get AI mediation

### Payments
- `POST /api/payments/create-intent` - Create Stripe payment intent
- `POST /api/payments/confirm` - Confirm payment

### User
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/picture` - Upload profile picture

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

- **Yaswanth** - *Initial work*

---

## 🙏 Acknowledgments

- Google Generative AI (Gemini) for AI-powered mediation
- Stripe for secure payment processing
- The open-source community for amazing tools and libraries



