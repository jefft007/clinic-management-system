import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../services/auth_api.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import 'main_shell.dart';

class OtpScreen extends StatefulWidget {
  final String phone;
  final String name;
  final int expiresInSeconds;
  final String? debugOtp;

  const OtpScreen({
    super.key,
    required this.phone,
    required this.name,
    required this.expiresInSeconds,
    this.debugOtp,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _otpController = TextEditingController();
  bool _loading = false;
  bool _resending = false;
  late int _secondsLeft;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _secondsLeft = 45; // resend cooldown mirrors the backend's 45s window
    if (widget.debugOtp != null) _otpController.text = widget.debugOtp!;
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsLeft <= 0) {
        timer.cancel();
        return;
      }
      setState(() => _secondsLeft--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final otp = _otpController.text.trim();
    if (otp.length < 4) {
      _showError('Enter the OTP sent to your phone');
      return;
    }
    setState(() => _loading = true);
    try {
      final result = await AuthApi.verifyOtp(widget.phone, otp);
      if (!mounted) return;
      // Always use the name the user entered during login rather than the old profile name
      final resolvedName = widget.name;
      await context.read<AuthState>().loginSuccess(
        token: result.token,
        phone: result.phone,
        name: resolvedName,
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const MainShell()),
        (route) => false,
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Could not reach the server. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await AuthApi.requestOtp(widget.phone);
      if (!mounted) return;
      setState(() => _secondsLeft = 45);
      _startTimer();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('OTP resent')),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } finally {
      if (mounted) setState(() => _resending = false);
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
      appBar: AppBar(title: const Text('Verify')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Enter the OTP sent to +91 ${widget.phone}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofocus: true,
                style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w700),
                decoration: const InputDecoration(
                  hintText: '••••••',
                  counterText: '',
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _loading ? null : _verify,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('Verify & Continue'),
              ),
              const SizedBox(height: 16),
              Center(
                child: _secondsLeft > 0
                    ? Text(
                        'Resend OTP in ${_secondsLeft}s',
                        style: const TextStyle(color: AppColors.textSecondary),
                      )
                    : TextButton(
                        onPressed: _resending ? null : _resend,
                        child: Text(_resending ? 'Resending…' : 'Resend OTP'),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
