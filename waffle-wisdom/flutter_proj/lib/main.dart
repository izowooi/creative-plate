// main.dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:waffle_wisdom/widget/empty_widget.dart';
import 'package:waffle_wisdom/widget/login_view.dart';
import 'package:waffle_wisdom/widget/ask_and_reply_view.dart';
import 'package:waffle_wisdom/widget/my_question_history_view.dart';

final sceneNameProvider = StateProvider<String>((ref) {
  return "";
});

final navigationIndexProvider = StateProvider<int>((ref) {
  return 0;
});


void main() async {
  WidgetsFlutterBinding.ensureInitialized(); // 바인딩 초기화
  await Firebase.initializeApp();
  
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown])
      .then((_) {
    runApp(ProviderScope(child: MainApp()));
  });
}

class MainApp extends ConsumerWidget {

  MainApp({super.key});

  final List<String> sceneNames = ['scene_1', 'scene_2', 'scene_3', 'scene_4'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentPageIndex = ref.watch(navigationIndexProvider);

    return MaterialApp(
      home: Builder(builder: (context){
        return Scaffold(
        bottomNavigationBar: NavigationBar(
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home), label: 'scene_1'),
          NavigationDestination(icon: const Icon(Icons.favorite), label: 'scene_2'),
          NavigationDestination(icon: const Icon(Icons.trending_up), label: 'scene_3'),
          NavigationDestination(icon: const Icon(Icons.settings), label: 'scene_4'),
        ],
        selectedIndex: currentPageIndex,
        onDestinationSelected: (index) {
            ref.read(sceneNameProvider.notifier).state = sceneNames[index];
            ref.read(navigationIndexProvider.notifier).state = index;
          },
        ),
        
        //drawer: LeftDrawerWidget(),
        body: IndexedStack(
          index: currentPageIndex,
          children: [
            AskAndReplyView(),
            LoginView(),
            MyQuestionHistoryView(),
            EmptyWidget(),
          ],
        ),
      );
    })
    );
  }
}