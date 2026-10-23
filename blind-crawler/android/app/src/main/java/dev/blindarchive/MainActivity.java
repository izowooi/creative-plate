package dev.blindarchive;
import android.app.*;
import android.os.*;
import android.provider.Settings;
import android.content.*;
import android.widget.*;
import android.text.InputType;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;

public final class MainActivity extends Activity {
 EditText server,token;TextView status;
 Button button(LinearLayout l,String label,Runnable run){Button b=new Button(this);b.setText(label);b.setOnClickListener(v->run.run());l.addView(b);return b;}
 public void onCreate(Bundle saved){super.onCreate(saved);LinearLayout l=new LinearLayout(this);l.setOrientation(1);l.setPadding(36,48,36,32);ScrollView scroll=new ScrollView(this);scroll.addView(l);setContentView(scroll);
 TextView title=new TextView(this);title.setText("블라인드 알림 보관");title.setTextSize(26);l.addView(title);
 TextView intro=new TextView(this);intro.setText("블라인드 알림의 제목·미리보기와 노출된 게시글 URL만 집의 Mac mini로 전달합니다. 다른 앱 알림은 저장하지 않습니다.\n\n본문은 서버에서 수집하며, URL이 없는 알림은 글과 연결되지 않을 수 있습니다.");intro.setPadding(0,24,0,24);l.addView(intro);
 SharedPreferences p=getSharedPreferences("settings",0);server=new EditText(this);server.setHint("서버 주소");server.setSingleLine();server.setText(p.getString("server","http://192.168.50.173:5067"));l.addView(server);
 token=new EditText(this);token.setHint("보관함 → 연결 및 상태 → 기기 연결 키");token.setSingleLine();token.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);token.setText(p.getString("token",""));l.addView(token);
 button(l,"1. 연결 설정 저장",()->{String u=server.getText().toString().trim();if(!Queue.localUrl(u)){Toast.makeText(this,"집 안의 로컬 IPv4 HTTP 주소를 입력하세요.",1).show();return;}p.edit().putString("server",u).putString("token",token.getText().toString().trim()).apply();Queue.schedule(this);refresh();});
 button(l,"2. 알림 접근 허용",()->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
 button(l,"3. 연결 테스트 / 대기 알림 전송",()->new Thread(()->{try(Queue q=new Queue(this)){JSONObject o=new JSONObject();o.put("event_key","test-"+System.currentTimeMillis());o.put("title","연결 테스트");o.put("body","갤럭시 탭에서 보관함 연결을 확인했습니다.");q.add(o);if(!q.upload(this))Queue.schedule(this);}catch(Exception ignored){}runOnUiThread(this::refresh);}).start());
 status=new TextView(this);status.setPadding(0,25,0,25);l.addView(status);button(l,"상태 새로고침",this::refresh);refresh();
 }
 protected void onResume(){super.onResume();if(status!=null)refresh();}
 String when(long t){return t==0?"아직 없음":DateFormat.getDateTimeInstance().format(new Date(t));}
 void refresh(){SharedPreferences p=getSharedPreferences("settings",0);int pending;try(Queue q=new Queue(this)){pending=q.size();}String enabled=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");boolean access=enabled!=null&&enabled.contains(getPackageName()+"/");status.setText("알림 접근: "+(access?"허용됨":"설정 필요")+"\n마지막 알림: "+when(p.getLong("last_received",0))+"\n마지막 전송: "+when(p.getLong("last_sent",0))+"\n대기 알림: "+pending+"개\n"+p.getString("last_status","아직 전송하지 않았습니다.")+"\n\n기기 설정에서 이 앱의 배터리 사용을 제한하지 않도록 설정해 주세요. 전송 실패한 알림은 로컬에 보관하고 재시도합니다.");}
}
