import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../model/user_model.dart';

final authControllerProvider = StateNotifierProvider<AuthController, UserModel?>(
  (ref) => AuthController(),
);

class AuthController extends StateNotifier<UserModel?> {
  AuthController() : super(null) {
    _checkCurrentUser();
  }

  final FirebaseAuth _auth = FirebaseAuth.instance;

  Future<void> _checkCurrentUser() async {
    final user = _auth.currentUser;
    if (user != null) {
      state = UserModel(uid: user.uid, isAnonymous: user.isAnonymous);
    }
  }

  Future<void> signInAnonymously() async {
    try {
      final userCredential = await _auth.signInAnonymously();
      final user = userCredential.user;
      if (user != null) {
        state = UserModel(uid: user.uid, isAnonymous: user.isAnonymous);
      }
    } catch (e) {
      print("로그인 실패: $e");
    }
  }
}