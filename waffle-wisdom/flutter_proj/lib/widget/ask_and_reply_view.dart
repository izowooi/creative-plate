// view/ask_and_reply_view.dart
import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:google_mlkit_language_id/google_mlkit_language_id.dart';


class AskAndReplyView extends StatefulWidget {
  const AskAndReplyView({super.key});

  @override
  State<AskAndReplyView> createState() => _AskAndReplyViewState();
}

class _AskAndReplyViewState extends State<AskAndReplyView> {
  final TextEditingController _controller = TextEditingController();
  final _languageIdentifier = LanguageIdentifier(confidenceThreshold: 0.5);
  String question = '';
  List<String> dummyAnswers = [
    '저는 이 의견에 찬성합니다.\n이유는 ...',
    '저는 이 의견에 반대합니다.',
    '저는 중립적인 입장입니다.',
  ];

  Future<void> _detectLanguage(String text) async {
    if (text.isEmpty) return;
    
    try {
      final String languageCode = await _languageIdentifier.identifyLanguage(text);
      print('Detected language: $languageCode');
      
      // 언어 코드를 사용자 친화적인 이름으로 변환
      String languageName = '';
      switch (languageCode) {
        case 'ko':
          languageName = '한국어';
          break;
        case 'en':
          languageName = '영어';
          break;
        case 'ja':
          languageName = '일본어';
          break;
        case 'zh':
          languageName = '중국어';
          break;
        default:
          languageName = '알 수 없는 언어';
      }
      
      print('입력된 텍스트의 언어: $languageName');
    } catch (e) {
      print('언어 감지 중 오류 발생: $e');
    }
  }

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
          Row(
            children: [
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    question = _controller.text;
                    _detectLanguage(question);
                    final textRecognizer = TextRecognizer(script: TextRecognitionScript.korean);
                    print('TextRecognizer: $textRecognizer');
                  });
                },
                child: const Text('전송'),
              ),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    question = _controller.text;
                    _detectLanguage(question);
                    final textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);
                    
                  });
                },
                child: const Text('Feel Good'),
              ),
            ]
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