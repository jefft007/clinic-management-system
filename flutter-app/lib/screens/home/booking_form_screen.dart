import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../models/availability.dart';
import '../../models/clinic.dart';
import '../../models/doctor.dart';
import '../../state/auth_state.dart';
import '../../services/patient_api.dart';
import '../../theme/app_theme.dart';
import 'booking_success_screen.dart';

class BookingFormScreen extends StatefulWidget {
  final Availability availability;
  final Doctor doctor;
  final Clinic clinic;
  final TokenDetail token;

  const BookingFormScreen({
    super.key,
    required this.availability,
    required this.doctor,
    required this.clinic,
    required this.token,
  });

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends State<BookingFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _altPhoneController = TextEditingController();
  final _ageController = TextEditingController();
  final _placeController = TextEditingController();
  String _gender = 'Male';
  bool _loading = false;
  bool _bookingForSomeoneElse = false;

  @override
  void initState() {
    super.initState();
    _fillUserInfo();
  }

  void _fillUserInfo() {
    final auth = context.read<AuthState>();
    if (auth.name != null) _nameController.text = auth.name!;
    if (auth.phone != null) _phoneController.text = auth.phone!;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _altPhoneController.dispose();
    _ageController.dispose();
    _placeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final appointment = await PatientApi.bookAppointment(
        availabilityId: widget.availability.availabilityId,
        tokenNumber: widget.token.tokenNumber,
        fullName: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
        alternatePhone: _altPhoneController.text.trim().isEmpty ? null : _altPhoneController.text.trim(),
        age: _ageController.text.trim().isEmpty ? null : int.tryParse(_ageController.text.trim()),
        gender: _gender,
        place: _placeController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => BookingSuccessScreen(
            appointment: appointment,
            doctor: widget.doctor,
            clinic: widget.clinic,
          ),
        ),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Could not book the appointment. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Patient Details')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Summary card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Token #${widget.token.tokenNumber}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.primaryDark),
                    ),
                    const SizedBox(height: 8),
                    Text('${widget.doctor.fullName} · ${widget.availability.session} Session', style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text('${widget.clinic.clinicName} · ${widget.availability.availableDate}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const Text('Patient Information', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              
              // Booking for someone else checkbox
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text('I am booking for someone else'),
                subtitle: _bookingForSomeoneElse 
                    ? const Text('Please provide the patient\'s details below.', style: TextStyle(fontSize: 12)) 
                    : null,
                value: _bookingForSomeoneElse,
                activeColor: AppColors.primary,
                onChanged: (val) {
                  setState(() {
                    _bookingForSomeoneElse = val ?? false;
                    if (_bookingForSomeoneElse) {
                      _nameController.clear();
                      _phoneController.clear();
                    } else {
                      _fillUserInfo();
                    }
                  });
                },
              ),
              const SizedBox(height: 8),

              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Patient Full Name *'),
                validator: (val) => val == null || val.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      maxLength: 10,
                      decoration: const InputDecoration(labelText: 'Patient Phone Number *', counterText: ''),
                      validator: (val) {
                        final digits = (val ?? '').replaceAll(RegExp(r'\D'), '');
                        if (digits.length != 10) return 'Valid 10-digit phone required';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _altPhoneController,
                      keyboardType: TextInputType.phone,
                      maxLength: 10,
                      decoration: InputDecoration(
                        labelText: _bookingForSomeoneElse ? 'Alternate Phone *' : 'Alternate Phone', 
                        counterText: ''
                      ),
                      validator: (val) {
                        final digits = (val ?? '').replaceAll(RegExp(r'\D'), '');
                        if (_bookingForSomeoneElse && digits.isEmpty) {
                          return 'Required when booking for others';
                        }
                        if (digits.isNotEmpty && digits.length != 10) return 'Must be 10 digits';
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    flex: 1,
                    child: TextFormField(
                      controller: _ageController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Age'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      initialValue: _gender,
                      decoration: const InputDecoration(labelText: 'Gender'),
                      items: ['Male', 'Female', 'Other']
                          .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                          .toList(),
                      onChanged: (val) => setState(() => _gender = val!),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _placeController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Place / City *'),
                validator: (val) => val == null || val.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('Confirm Booking'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
