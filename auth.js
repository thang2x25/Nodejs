const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.addAdminRole = functions.https.onCall((data, context) => {
    if(context.auth.token.admin != true){
        throw new functions.https.HttpsError(
            'permission-denied',
            'Chỉ admin mới có thể cấp quyền admin cho người khác.'
        );
    }
    return admin.auth().getUserByEmail(data.email).then(user => {
        return admin.auth().setCustomUserClaims(user.uid, {
            admin: true
        });
    }).then(() => {
        return {
            message: `Success! ${data.email} has been made an admin`

        }
    }).catch(err => {
        return err;
    });
});