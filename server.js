require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const requiredEnvVars = ['SENDGRID_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Thiếu các biến môi trường:', missingVars.join(', '));
  console.error('Vui lòng kiểm tra file .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.DATABASE_URL
});

const db = admin.firestore();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = process.env.ADMIN_EMAIL || 'thang.nguyen@lockernlock.vn';

async function sendOtpEmail(email, otp) {
  const mailOptions = {
    from: `"Smart Farming" <${FROM_EMAIL}>`,
    to: email,
    subject: 'Mã xác thực đặt lại mật khẩu - Smart Farming',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #2e2e2e;
            background: #e8f5e9;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #2e7d32, #4caf50, #26a69a);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 12px 12px 0 0;
          }
          .content {
            background: #ffffff;
            padding: 30px;
            border: 1px solid #d0e2d8;
            border-top: none;
          }
          .otp-box {
            background: #e0f2f1; 
            border: 2px dashed #26a69a;
            padding: 20px;
            text-align: center;
            margin: 25px 0;
            border-radius: 10px;
          }
          .otp-code {
            font-size: 42px;
            font-weight: bold;
            color: #2e7d32;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
          }
          .footer {
            background: #c8e6c9;
            padding: 20px;
            text-align: center;
            color: #2e7d32;
            font-size: 12px;
            border-radius: 0 0 12px 12px;
          }
          .warning {
            color: #d32f2f;
            font-weight: bold;
            margin-top: 15px;
          }
          .info-box {
            background: #fffde7;
            border-left: 4px solid #fbc02d;
            padding: 12px;
            margin: 15px 0;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0;">🌿 Smart Farming</h1>
          <p style="margin: 10px 0 0;">Hệ thống quản lý nông trại thông minh</p>
        </div>
        <div class="content">
          <h2>Xin chào!</h2>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản <strong>${email}</strong></p>
          <p>Mã xác thực OTP của bạn là:</p>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          <div class="info-box">
            ⏰ <strong>Mã có hiệu lực trong 5 phút</strong>
          </div>
          <p>Vui lòng nhập mã này trong ứng dụng Smart Farming để hoàn tất việc đặt lại mật khẩu.</p>
          <p class="warning">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
        </div>
        <div class="footer">
          <p>Email tự động từ hệ thống Smart Farming</p>
          <p>© 2025 Smart Farming. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  };

  try {
    await sgMail.send(mailOptions);
    console.log(`SendGrid: Email OTP đã gửi tới ${email}`);
  } catch (error) {
  console.error("❌ Lỗi gửi email qua SendGrid:", error.response?.body || error);
    if (error.response?.body?.errors) {
    console.error("Chi tiết lỗi:", JSON.stringify(error.response.body.errors, null, 2));
  }
  
  throw error;
}
}

app.post('/api/send-reset-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log(`[${new Date().toISOString()}] Request send OTP for: ${email}`);
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng nhập email' 
      });
    }
    
    try {
      await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ 
          success: false, 
          message: 'Email không tồn tại trong hệ thống' 
        });
      }
      throw error;
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; 
    
    await db.collection('passwordResets').doc(email).set({
      otp: otp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      used: false,
      attempts: 0
    });
    
    await sendOtpEmail(email, otp);
    
    res.json({ 
      success: true, 
      message: 'Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.' 
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending OTP:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi gửi OTP. Vui lòng thử lại sau.' 
    });
  }
});

app.post('/api/verify-otp-reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin. Vui lòng nhập đầy đủ email, OTP và mật khẩu mới.' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mật khẩu phải có ít nhất 6 ký tự' 
      });
    }
    
    const otpDoc = await db.collection('passwordResets').doc(email).get();
    
    if (!otpDoc.exists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mã OTP không tồn tại. Vui lòng yêu cầu gửi lại mã mới.' 
      });
    }
    
    const otpData = otpDoc.data();
    
    if (otpData.used) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mã OTP đã được sử dụng. Vui lòng yêu cầu mã mới.' 
      });
    }
    
    if (Date.now() > otpData.expiresAt) {
      await db.collection('passwordResets').doc(email).delete();
      return res.status(400).json({ 
        success: false, 
        message: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.' 
      });
    }
    
    if (otpData.attempts >= 5) {
      await db.collection('passwordResets').doc(email).delete();
      return res.status(400).json({ 
        success: false, 
        message: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' 
      });
    }
    
    if (otpData.otp !== otp.trim()) {
      await db.collection('passwordResets').doc(email).update({
        attempts: admin.firestore.FieldValue.increment(1)
      });
      
      const remainingAttempts = 5 - (otpData.attempts + 1);
      
      return res.status(400).json({ 
        success: false, 
        message: `Mã OTP không đúng. Còn ${remainingAttempts} lần thử.` 
      });
    }
    
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, {
      password: newPassword
    });
    
    await db.collection('passwordResets').doc(email).update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới.' 
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error verifying OTP:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi xác thực. Vui lòng thử lại sau.' 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Smart Farming OTP Service'
  });
});

async function listAllUsers(nextPageToken, index = 1) {
  const result = await admin.auth().listUsers(1000, nextPageToken);
  const db = admin.database();
  
  result.users.forEach((user) => {
    if(user.email === FROM_EMAIL){
      const data = { isAdmin: true };
      db.ref("authUsers/" + user.uid).update(data);
    }
  });

  if (result.pageToken) {
    await listAllUsers(result.pageToken, index + result.users.length);
  }
}

app.post("/createRole", async (req, res) => {
  const { targetUid, idToken } = req.body;
  try {
    const authorize = await admin.auth().verifyIdToken(idToken);
    const callerUid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${callerUid}/isAdmin`).once("value");
    if (!snapshot.val()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền Admin"
      });
    }
    
    const targetSnapshot = await admin.database().ref(`authUsers/${targetUid}/isAdmin`).once("value");
    const checkRole = targetSnapshot.val();
    
    if(checkRole == false){
      await admin.database().ref(`authUsers/${targetUid}`).update({ isAdmin: true });
      res.json({
        success: true,
        message: "Cấp quyền Admin thành công"
      });
    } else {
      await admin.database().ref(`authUsers/${targetUid}`).update({ isAdmin: false });
      res.json({
        success: true,
        message: "Cấp quyền User thành công"
      });
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: "Lỗi xác thực hoặc không thể ghi database."
    });
  }
});

app.post("/deleteUser", async (req, res) => {
  const { targetUid, idToken } = req.body;
  try {
    const authorize = await admin.auth().verifyIdToken(idToken);
    const callerUid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${callerUid}/isAdmin`).once("value");
    if (!snapshot.val()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền Admin"
      });
    }
    
    await admin.auth().deleteUser(targetUid);
    await admin.database().ref(`authUsers/${targetUid}`).remove();
    
    res.json({
      success: true,
      message: "Xóa User thành công"
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: "Lỗi xác thực hoặc không thể ghi database."
    });
  }
});

app.post("/statusUser", async (req, res) => {
  const { targetUid, idToken } = req.body;
  try {
    const authorize = await admin.auth().verifyIdToken(idToken);
    const callerUid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${callerUid}/isAdmin`).once("value");
    if (!snapshot.val()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền Admin"
      });
    }

    const userRecord = await admin.auth().getUser(targetUid);
    const checkStatus = userRecord.disabled;
    
    if(checkStatus){
      await admin.auth().updateUser(targetUid, {disabled: false});
      await admin.database().ref(`authUsers/${targetUid}`).update({ status: true });
      res.json({
        success: true,
        message: "Kích hoạt User thành công"
      });
    } else {
      await admin.auth().updateUser(targetUid, {disabled: true});
      await admin.database().ref(`authUsers/${targetUid}`).update({ status: false });
      res.json({
        success: true,
        message: "Vô hiệu hóa User thành công"
      });
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: "Lỗi xác thực hoặc không thể ghi database."
    });
  }
}); 

async function sendMail(email, sensor, type, current, threshold) {
  const htmlBody = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #e8f5e9;
        padding: 20px;
        margin: 0;
      }
      .container {
        max-width: 600px;
        background: #ffffff;
        margin: auto;
        border-radius: 14px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.10);
        overflow: hidden;
      }
      .header {
        background: linear-gradient(135deg, #2e7d32, #4caf50, #26a69a); 
        padding: 28px;
        text-align: center;
        color: white;
      }
      .header h1 {
        margin: 0;
        font-size: 25px;
      }
      .content {
        padding: 25px;
        color: #2e2e2e;
      }
      .alert-box {
        background: #e0f2f1; 
        border-left: 6px solid #26a69a; 
        padding: 15px;
        margin: 20px 0;
        border-radius: 6px;
        font-size: 15px;
        color: #004d40;
      }
      .info-table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
      }
      .info-table td {
        padding: 10px 5px;
        border-bottom: 1px solid #e0e0e0;
      }
      .label {
        font-weight: bold;
        color: #2e7d32;
      }
      .current-value {
        color: #c62828;
        font-weight: bold;
      }
      .footer {
        background: #c8e6c9;
        padding: 15px;
        text-align: center;
        font-size: 13px;
        color: #2e7d32;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Cảnh báo cảm biến vượt ngưỡng</h1>
        <p style="margin: 5px 0 0;">Smart Farming System</p>
      </div>
      <div class="content">
        <p><strong>Một giá trị cảm biến đang vượt khỏi vùng an toàn.</strong></p>
        <div class="alert-box">
          Giá trị thu được từ cảm biến <strong>${type}</strong> tại node <strong>${sensor}</strong> đang vượt khỏi ngưỡng an toàn.
        </div>
        <table class="info-table">
          <tr>
            <td class="label">Node:</td>
            <td>${sensor}</td>
          </tr>
          <tr>
            <td class="label">Loại cảm biến:</td>
            <td>${type}</td>
          </tr>
          <tr>
            <td class="label">Giá trị hiện tại:</td>
            <td class="current-value">${current}</td>
          </tr>
          <tr>
            <td class="label">Ngưỡng cho phép:</td>
            <td><strong>${threshold}</strong></td>
          </tr>
        </table>
        <p style="margin-top:18px;">Xin hãy kiểm tra khu vực này.</p>
      </div>
      <div class="footer">
        Email tự động từ hệ thống Smart Farming © 2025
      </div>
    </div>
  </body>
  </html>
  `;

  await sgMail.send({
    to: email,
    from: `"Smart Farming" <${FROM_EMAIL}>`,
    subject: `Cảnh báo ${type} tại node ${sensor}`,
    html: htmlBody
  });
}

app.post('/api/send-warning-gmail', async (req, res) => {
  try {
    const { email, sensor, type, currentValues, thresholdValues } = req.body;
    await sendMail(email, sensor, type, currentValues, thresholdValues);
    res.json({ success: true, message: "Mail sent!" });
  } catch (error) {
  console.error("Lỗi gửi email qua SendGrid:", error.response?.body || error);
    if (error.response?.body?.errors) {
    console.error("Chi tiết lỗi:", JSON.stringify(error.response.body.errors, null, 2));
  }
  
  throw error;
}
});

app.post("/checkRole", async (req, res) => {
  const { idToken } = req.body;

  try {
    const authorize = await admin.auth().verifyIdToken(idToken);
    const uid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${uid}/isAdmin`).once("value");
    if (snapshot.val() === true) {
      return res.status(200).json({
        success: true,
        message: "Xác thực thành công, được phép truy cập vào giao diện này"
      });
    }

    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền Admin"
    });

  } 
  catch (err) {
    console.error(err);
    return res.status(401).json({
      success: false,
      message: "Token không hợp lệ hoặc đã hết hạn"
    });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nServer đang chạy ở Port: ${PORT}`);
  console.log(`Server time: ${new Date().toISOString()}\n`);
});