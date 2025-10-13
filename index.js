const express = require('express');
const admin = require("firebase-admin");
const fs = require("fs");
const app = express();

const cors = require("cors");
app.use(cors({ origin: true }));
const serviceAccount = require("./serviceAccountKey.json");
const { join } = require("path");
const { error } = require('console');
const { UserRecord } = require('firebase-admin/auth');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://esp-mdf-smart-farm-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

app.use(express.json());
// Hàm lấy toàn bộ user
async function listAllUsers(nextPageToken, index = 1) {
  const result = await admin.auth().listUsers(1000, nextPageToken);

  const db = admin.database();
  result.users.forEach((user, i) => {
    if(user.email == "phuquocvuong233@gmail.com"){
      const data = {
        isAdmin: true
      }
    db.ref("authUsers/" + user.uid).update(data);
    }
  });

  if (result.pageToken) {
    await listAllUsers(result.pageToken, index + result.users.length);
  }
}

app.post("/createRole", async (req, res) => {
  console.log("✅ Nhận yêu cầu /createRole:", req.body);
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
    }
    else{
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
  console.log("✅ Nhận yêu cầu /deleteUser:", req.body);
   const { targetUid, idToken } = req.body;
   try{
    const authorize = await admin.auth().verifyIdToken(idToken);
    const callerUid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${callerUid}/isAdmin`).once("value");
    if (!snapshot.val()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền Admin"
      });
    }
    await admin.auth()
        .deleteUser(targetUid)
        .then(() => {
          console.log('Successfully deleted user');
        })
        .catch((error) => {
          console.log('Error deleting user:', error);
        });
    await admin.database().ref(`authUsers/${targetUid}`).remove();
    res.json({
        success: true,
        message: "Xóa User thành công"
      });
   }
   catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: "Lỗi xác thực hoặc không thể ghi database."
    });
  }
});

app.post("/statusUser", async (req, res) => {
  console.log("✅ Nhận yêu cầu /statusUser:", req.body);
   const { targetUid, idToken } = req.body;
   try{
    const authorize = await admin.auth().verifyIdToken(idToken);
    const callerUid = authorize.uid;

    const snapshot = await admin.database().ref(`authUsers/${callerUid}/isAdmin`).once("value");
    if (!snapshot.val()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền Admin"
      });
    }

    //const targetSnapshot = await admin.database().ref(`authUsers/${targetUid}/status`).once("value");
    const userRecord = await admin.auth().getUser(targetUid);
    const checkStatus = userRecord.disabled;
    if(checkStatus){
      await admin.auth().updateUser(targetUid, {disabled: false});
      await admin.database().ref(`authUsers/${targetUid}`).update({ status: false });
        res.json({
          success: true,
          message: "Vô hiệu hóa User thành công"
        });
    }
    else{
      await admin.auth().updateUser(targetUid, {disabled: true});
      await admin.database().ref(`authUsers/${targetUid}`).update({ status: true });
        res.json({
          success: true,
          message: "Kích hoạt User thành công"
        });
    }
   }
   catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: "Lỗi xác thực hoặc không thể ghi database."
    });
  }
});

app.listen(5000, "0.0.0.0", () => console.log("Server chạy cổng 5000"));
listAllUsers().then(() => {
  console.log("✅ Đã đồng bộ xong users vào Realtime Database");
}).catch(error => {
  console.error("❌ Lỗi:", error);
});

