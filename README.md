# 🏥 Clinic Management System

A full-stack clinic management system designed to digitally manage clinic operations, doctor schedules, clinic staff activities, and patient token bookings through a web application and Android mobile application.

The system provides separate role-based interfaces for **Administrators, Doctors, Clinic Staff, and Patients**, with a shared REST API and MySQL database.

---

## 🌐 Live Project

| Platform | Link |
|----------|------|
| 🌐 **Live Web Application** | [Open Web Application](https://frontend-web-eta-green.vercel.app/) |
| 📱 **Patient Android Application** | [Download Latest APK](https://github.com/jefft007/clinic-management-system/releases/latest) |
| 💻 **GitHub Repository** | [View Source Code](https://github.com/jefft007/clinic-management-system) |
| 🔗 **Backend API** | `https://clinic-management-system-8c9d.onrender.com` |
| ❤️ **API Health Check** | [Check API Status](https://clinic-management-system-8c9d.onrender.com/api/health) |

---

# 🔑 Demo Accounts

The web application uses role-based authentication.

Recruiters and reviewers can use the following **demo accounts** to explore the different interfaces.

> ⚠️ These should be dedicated demonstration accounts. Do not use personal or production credentials in a public repository.

| Role | Email | Password |
|------|-------|----------|
| 👨‍💼 Admin | `admin-demo@example.com` | `DemoAdmin@123` |
| 🏥 Clinic Staff | `staff-demo@example.com` | `DemoStaff@123` |
| 👨‍⚕️ Doctor | `doctor-demo@example.com` | `DemoDoctor@123` |

### How to use

1. Open the [Live Web Application](https://frontend-web-eta-green.vercel.app/).
2. Enter one of the demo email addresses.
3. Enter the corresponding demo password.
4. Login.
5. Explore the dashboard and features available for that role.

### Available Web Roles

#### 👨‍💼 Admin

The Admin interface provides access to system-level management features such as:

- Clinic management
- Doctor management
- Clinic staff management
- User management
- Role-based access
- Clinic-related information

#### 🏥 Clinic Staff

Clinic staff can manage day-to-day clinic operations including:

- Doctor sessions
- Token queues
- Patient bookings
- Session-related activities
- Clinic operations

#### 👨‍⚕️ Doctor

Doctors can access:

- Doctor dashboard
- Assigned sessions
- Patient token information
- Consultation-related activities

---

# 📱 Patient Android Application

The patient-facing application is built using **Flutter** and provides a separate mobile experience for patients.

### Patient Features

- Email OTP authentication
- Phone number-based patient identification
- Clinic selection
- Doctor selection
- Session selection
- Token availability
- Token booking
- Estimated consultation time
- Booking confirmation
- Session expiry validation

### Download

📱 **[Download Latest Patient APK](https://github.com/jefft007/clinic-management-system/releases/latest)**

### Patient Authentication Flow

```text
Patient
   │
   ▼
Enter Email + Phone Number
   │
   ▼
Request OTP
   │
   ▼
Email OTP
   │
   ▼
Verify OTP
   │
   ▼
JWT Authentication
   │
   ▼
Patient Application
