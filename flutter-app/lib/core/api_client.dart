import 'dart:convert';
import 'package:http/http.dart' as http;
import 'constants.dart';
import 'session.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Every endpoint in this backend replies with a JSON body shaped like
/// `{ success: bool, message?: string, ...data }`. This client centralizes
/// that contract so screens just call `get`/`post` and get a decoded map
/// back, or an ApiException with the server's own message.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Map<String, String> _headers({bool auth = false}) {
    final headers = {'Content-Type': 'application/json'};
    if (auth && Session.instance.token != null) {
      headers['Authorization'] = 'Bearer ${Session.instance.token}';
    }
    return headers;
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    Map<String, String>? cleanQuery;
    if (query != null) {
      cleanQuery = <String, String>{};
      query.forEach((k, v) {
        final s = v?.toString() ?? '';
        if (s.isNotEmpty) cleanQuery![k] = s;
      });
    }
    return Uri.parse('${ApiConfig.baseUrl}$path').replace(
      queryParameters: (cleanQuery == null || cleanQuery.isEmpty) ? null : cleanQuery,
    );
  }

  Map<String, dynamic> _unwrap(http.Response response) {
    Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException(
        'Unexpected response from server (${response.statusCode})',
        statusCode: response.statusCode,
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    throw ApiException(
      body['message']?.toString() ?? 'Something went wrong',
      statusCode: response.statusCode,
    );
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
    bool auth = false,
  }) async {
    final response = await http
        .get(_uri(path, query), headers: _headers(auth: auth))
        .timeout(const Duration(seconds: 20));
    return _unwrap(response);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
  }) async {
    final response = await http
        .post(
          _uri(path),
          headers: _headers(auth: auth),
          body: jsonEncode(body ?? {}),
        )
        .timeout(const Duration(seconds: 20));
    return _unwrap(response);
  }
}
