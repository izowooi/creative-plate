// view/ask_and_reply_view.dart
import 'package:flutter/material.dart';

class AskAndReplyView extends StatefulWidget {
  const AskAndReplyView({super.key});

  @override
  State<AskAndReplyView> createState() => _AskAndReplyViewState();
}

class _AskAndReplyViewState extends State<AskAndReplyView> {
  final TextEditingController _controller = TextEditingController();
  String question = '';
  List<String> dummyAnswers = [
    '저는 이 의견에 찬성합니다.\n이유는 ...',
    '저는 이 의견에 반대합니다.',
    '저는 중립적인 입장입니다.',
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(
            controller: _controller,
            decoration: const InputDecoration(
              labelText: '질문을 입력하세요',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () {
              setState(() {
                question = _controller.text;
              });
            },
            child: const Text('전송'),
          ),
          const SizedBox(height: 20),
          if (question.isNotEmpty)
            Expanded(
              child: ListView.builder(
                itemCount: 3,
                itemBuilder: (context, index) {
                  final personaName = '페르소나 ${index + 1}';
                  final answer = dummyAnswers[index];
                  final isPro = answer.contains('찬성');
                  final isCon = answer.contains('반대');

                  return Card(
                    shape: RoundedRectangleBorder(
                      side: BorderSide(
                        color: isPro
                            ? Colors.green
                            : isCon
                                ? Colors.red
                                : Colors.grey,
                        width: 2,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundImage: AssetImage('assets/face/face${index + 1}.png'), // 각 페르소나 초상화
                      ),
                      title: Text(personaName),
                      subtitle: Text(answer),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}