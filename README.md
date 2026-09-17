# 🏥 Clinic Management System

A full-stack clinic management system designed to manage clinic operations, doctor schedules, staff activities, and patient token bookings through a web application and Android mobile application.

The system provides separate interfaces for **Administrators, Doctors, Clinic Staff, and Patients**, with a shared REST API and MySQL database.

---

## 🌐 Live Project

| Platform                   | Link                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| 🌐 **Live Web App**        | **[Open Web Application](https://frontend-web-eta-green.vercel.app/login)**                                              |
| 📱 **Patient Android App** | **[Download APK](https://github.com/jefft007/clinic-management-system/releases/latest)** |
| 💻 **GitHub Repository**   | **[View Source Code](https://github.com/jefft007/clinic-management-system)**             |
| 🔗 **Backend API**         | **https://clinic-management-system-8c9d.onrender.com**                                   |

> Replace `YOUR_VERCEL_URL` with your actual Vercel deployment URL.

---

## 📌 Project Overview

The Clinic Management System is a full-stack application that helps clinics manage their daily operations digitally.

The system includes:

* A web application for Admin, Doctor, and Clinic Staff
* An Android mobile application for patients
* REST APIs for communication between applications
* MySQL database for storing application data
* Email OTP authentication for patients
* Online patient token booking
* Session-based token availability
* Protection against booking tokens after a session has ended

---

# ✨ Features

### 👨‍💼 Admin

* Manage clinics
* Manage doctors
* Manage clinic staff
* Manage users and access
* View and manage clinic-related information

### 👨‍⚕️ Doctor

* Doctor dashboard
* View assigned sessions
* View patient token information
* Manage consultation-related activities

### 🏥 Clinic Staff

* Manage clinic operations
* Manage doctor sessions
* Manage token queues
* View patient booking information
* Handle daily clinic activities

### 👤 Patient

* Patient registration/login
* Email OTP authentication
* Select clinic
* Select doctor
* View available sessions
* View available tokens
* Book a token
* View estimated consultation time
* Prevent booking after a session has ended

---

# 💻 Web Application

The web application provides role-based interfaces for:

* **Admin**
* **Doctor**
* **Clinic Staff**

The frontend communicates with the Node.js/Express backend through REST APIs.

### Web Technologies

* React
* Vite
* JavaScript
* Axios
* Tailwind CSS / CSS
* REST API

### Web Application Flow

```text
User
  │
  ▼
React Web Application
  │
  │ REST API
  ▼
Node.js + Express Backend
  │
  ▼
MySQL Database
```

---

# 📱 Patient Mobile Application

The patient application is built using **Flutter** and allows patients to interact with the clinic system from an Android device.

### Patient App Features

* Email OTP login
* Clinic selection
* Doctor selection
* Session selection
* Token availability
* Token booking
* Estimated consultation time
* Session expiry validation

### Patient Authentication

Patients provide:

```text
Email
Phone Number
```

An OTP is sent to the patient's email for authentication.

The phone number is used as the patient's identity for appointment/token operations, while the OTP is delivered through email.

### APK Download

📱 **[Download the latest Patient Android APK](https://github.com/jefft007/clinic-management-system/releases/latest)**

The APK is distributed through GitHub Releases.

---

# 🛠️ Tech Stack

## Frontend

* React
* Vite
* JavaScript
* Axios
* Tailwind CSS

## Backend

* Node.js
* Express.js
* REST APIs
* JavaScript

## Mobile

* Flutter
* Dart

## Database

* MySQL
* Aiven MySQL

## Authentication & Communication

* JWT
* Email OTP
* Brevo Transactional Email API

## Deployment

* Vercel — Web Frontend
* Render — Backend API
* Aiven — MySQL Database
* GitHub Releases — Android APK

## Development Tools

* Git
* GitHub
* VS Code
* Postman

---

# 🏗️ System Architecture

```text
                         ┌──────────────────────┐
                         │      Web Users       │
                         │ Admin / Doctor /     │
                         │     Clinic Staff     │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    React Web App     │
                         │        Vercel        │
                         └──────────┬───────────┘
                                    │
                                    │ REST API
                                    ▼
┌──────────────────┐      ┌──────────────────────┐
│ Patient Android  │─────▶│  Node.js + Express   │
│  Flutter App     │ REST │      Backend API     │
└──────────────────┘      │       Render         │
                          └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │      MySQL DB        │
                          │        Aiven         │
                          └──────────────────────┘
                                     │
                                     │
                          ┌──────────────────────┐
                          │   Brevo Email API    │
                          │     Patient OTP      │
                          └──────────────────────┘
```

---

# 👥 User Roles

| Role            | Platform | Main Responsibilities                              |
| --------------- | -------- | -------------------------------------------------- |
| 👨‍💼 Admin     | Web      | Manage clinics, doctors, staff and system data     |
| 👨‍⚕️ Doctor    | Web      | Manage sessions and view patient/token information |
| 🏥 Clinic Staff | Web      | Manage clinic operations and token queues          |
| 👤 Patient      | Android  | Select clinic/doctor/session and book tokens       |

---

# 🔗 Backend / API

The backend is a REST API built with **Node.js and Express.js**.

### Production API

```text
https://clinic-management-system-8c9d.onrender.com/api
```

### Health Check

```text
https://clinic-management-system-8c9d.onrender.com/api/health
```

The frontend web application and Flutter patient application both communicate with the backend API.

---

# 🔐 Authentication

The application uses different authentication mechanisms depending on the user type.

### Web Users

Web users authenticate through the application's role-based authentication system.

### Patients

Patients use:

```text
Email + Phone Number
        │
        ▼
    OTP Request
        │
        ▼
    Brevo Email API
        │
        ▼
     Email OTP
        │
        ▼
    OTP Verification
        │
        ▼
       JWT
```

Passwords and authentication-related data are handled by the backend rather than being exposed to the frontend.

---

# 🗄️ Database

The application uses **MySQL** as its primary database.

The production database is hosted using **Aiven MySQL**.

The database stores information related to:

* Users
* Patients
* Clinics
* Doctors
* Clinic staff
* Doctor sessions
* Token availability
* Patient bookings
* OTP verification records

---

# 📸 Screenshots

Screenshots can be added here to demonstrate the main application interfaces.

### Web Application

#### Admin Dashboard

```text
Add screenshot here
```

#### Doctor Dashboard

```text
Add screenshot here
```

#### Clinic Staff Dashboard

```text
Add screenshot here
```

### Patient Mobile Application

#### Patient Login

```text
Add screenshot here
```

#### Clinic / Doctor Selection

```text
Add screenshot here
```

#### Token Booking

```text
Add screenshot here
```

#### Booking Confirmation

```text
Add screenshot here
```

> Screenshots can be added using GitHub image uploads or files stored inside the repository.

---

# 🚀 Installation & Setup

## 1. Clone the Repository

```bash
git clone https://github.com/jefft007/clinic-management-system.git

cd clinic-management-system
```

---

# 💻 Web Frontend Setup

Navigate to the frontend:

```bash
cd frontend-web
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The application will normally run at:

```text
http://localhost:5173
```

### Production Build

```bash
npm run build
```

---

# ⚙️ Backend Setup

Navigate to the backend:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
PORT=5000

DB_HOST=your_database_host
DB_PORT=your_database_port
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name

JWT_SECRET=your_jwt_secret

BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender_email
```

Start the backend:

```bash
npm start
```

> Never commit `.env` files, API keys, database passwords, JWT secrets, or other credentials to GitHub.

---

# 📱 Flutter App Setup

Navigate to the Flutter application:

```bash
cd flutter-app
```

Install dependencies:

```bash
flutter pub get
```

Run the application:

```bash
flutter run
```

The production API is configured to use:

```text
https://clinic-management-system-8c9d.onrender.com/api
```

---

# 📦 Build Android APK

To create a release APK:

```bash
flutter build apk --release
```

The generated APK can be found in:

```text
build/app/outputs/flutter-apk/
```

The production APK is published through **GitHub Releases**.

📱 **[Download Patient App](https://github.com/jefft007/clinic-management-system/releases/latest)**

---

# 🔑 Environment Variables

The backend requires environment variables for production configuration.

| Variable             | Purpose                        |
| -------------------- | ------------------------------ |
| `PORT`               | Backend server port            |
| `DB_HOST`            | MySQL host                     |
| `DB_PORT`            | MySQL port                     |
| `DB_USER`            | MySQL username                 |
| `DB_PASSWORD`        | MySQL password                 |
| `DB_NAME`            | Database name                  |
| `JWT_SECRET`         | JWT signing secret             |
| `BREVO_API_KEY`      | Brevo email API authentication |
| `BREVO_SENDER_EMAIL` | Verified email sender          |

### Security

The following files and information should **not** be committed:

```text
.env
clinic_backup.sql
node_modules/
.dart_tool/
build/
dist/
API keys
Database credentials
JWT secrets
```

---

# 🌐 Deployment

## Frontend

```text
React + Vite
      ↓
   Vercel
```

## Backend

```text
Node.js + Express
      ↓
    Render
```

## Database

```text
MySQL
  ↓
Aiven
```

## Mobile Application

```text
Flutter
  ↓
Android APK
  ↓
GitHub Releases
```

---

# 🔄 Application Flow

### Patient Token Booking

```text
Patient
   │
   ▼
Login with Email OTP
   │
   ▼
Select Clinic
   │
   ▼
Select Doctor
   │
   ▼
Select Available Session
   │
   ▼
View Available Tokens
   │
   ▼
Select Token
   │
   ▼
Book Token
   │
   ▼
Booking Confirmation
   │
   ▼
Estimated Consultation Time
```

The backend validates the session before allowing a booking, so tokens cannot be booked after the session has ended.

---

# 🧪 Testing

Important areas tested during development include:

* Patient OTP authentication
* API communication
* Clinic selection
* Doctor selection
* Session availability
* Token booking
* Session expiry
* JWT authentication
* Email delivery
* Web application API integration
* Flutter application API integration

---

# 📁 Project Structure

```text
clinic-management-system/
│
├── frontend-web/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   ├── config/
│   └── server.js
│
├── flutter-app/
│   ├── lib/
│   ├── android/
│   ├── pubspec.yaml
│   └── ...
│
├── README.md
└── .gitignore
```

---

# 🔮 Future Improvements

Possible future improvements include:

* Push notifications for patients
* Appointment reminders
* Doctor availability notifications
* Online consultation support
* Payment integration
* Prescription management
* Medical records management
* Advanced analytics and reporting
* Queue status notifications
* Improved mobile UI/UX
* Automated CI/CD deployment

---

# 👨‍💻 Developer

**Jeff Thomas**

BCA — Cloud Computing

### Profiles

* 💻 **GitHub:** [jefft007](https://github.com/jefft007)
* 🌐 **Portfolio:** [Personal Portfolio](https://jeff-personal-portfolio.vercel.app/)
* 💼 **LinkedIn:** [LinkedIn Profile](https://www.linkedin.com/in/jeff-thomas-769932275/)

---

## 📄 License

This project is intended for educational, portfolio, and demonstration purposes.
