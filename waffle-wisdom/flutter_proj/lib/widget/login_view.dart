import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../controller/auth_controller.dart';

class LoginView extends ConsumerWidget {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider);

    return Center(
      child: user == null
          ? ElevatedButton(
              onPressed: () {
                ref.read(authControllerProvider.notifier).signInAnonymously();
              },
              child: const Text("익명 로그인"),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 48),
                const SizedBox(height: 12),
                Text("로그인 성공! UID: ${user.uid}"),
              ],
            ),
    );
  }
}