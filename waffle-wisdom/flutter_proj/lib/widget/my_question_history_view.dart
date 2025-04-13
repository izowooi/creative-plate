// view/my_question_history_view.dart
import 'package:flutter/material.dart';

class MyQuestionHistoryView extends StatelessWidget {
  const MyQuestionHistoryView({super.key});

  @override
  Widget build(BuildContext context) {
    final dummyQuestions = [
      'AI가 인간을 대체할 수 있을까?',
      '전자책이 종이책을 완전히 대체할까?',
      'SNS는 사회에 해로운가?',
    ];

    return ListView.separated(
      itemCount: dummyQuestions.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        return ListTile(
          title: Text(dummyQuestions[index]),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            // 나중에 상세보기로 이동
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('질문 상세 보기 기능은 아직 구현되지 않았습니다.')),
            );
          },
        );
      },
    );
  }
}