const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Cấu hình thư mục lưu ảnh upload chung (avatar & bill)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'file_' + Date.now() + ext);
    }
});
const upload = multer({ storage });

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const BANK_FILE = path.join(__dirname, 'bank-config.json');
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

if (!fs.existsSync(BANK_FILE)) {
    const defaultBanks = [
        {
            id: 'bank_1',
            BANK_ID: 'MBBank',
            ACCOUNT_NO: '03703079999',
            ACCOUNT_NAME: 'VAN THUA',
            MEMO: 'napxutt KTX',
            minAmount: 10000,
            maxAmount: 3000000,
            active: true
        }
    ];
    fs.writeFileSync(BANK_FILE, JSON.stringify(defaultBanks, null, 2));
}

const readOrders = () => JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8') || "[]");
const writeOrders = (data) => fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));

const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || "[]");
const writeUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));

const readBanks = () => {
    try {
        const data = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
};
const writeBanks = (data) => fs.writeFileSync(BANK_FILE, JSON.stringify(data, null, 2));

const ADMIN_SECRET = "ADMIN_SECRET_TOKEN_TIKTOK_2026";

const verifyAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === ADMIN_SECRET) {
        next();
    } else {
        res.status(403).json({ success: false, message: "Không có quyền truy cập!" });
    }
};

app.post('/api/get-tiktok-info', async (req, res) => {
    let { username, zalo } = req.body;
    if (!username) return res.status(400).json({ success: false, message: "Thiếu ID TikTok!" });

    username = username.trim().replace('@', '');
    let users = readUsers();
    let existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    let customNickname = username;
    let customAvatar = `/default-avatar.webp`;
    let userZalo = zalo || '';
    let userSpins = 0;

    if (existingUser) {
        existingUser.lastLogin = new Date().toISOString();
        if (zalo) existingUser.zalo = zalo;
        if (existingUser.customNickname) customNickname = existingUser.customNickname;
        if (existingUser.customAvatar) customAvatar = existingUser.customAvatar;
        if (existingUser.zalo) userZalo = existingUser.zalo;
        userSpins = existingUser.spins || 0;
    } else {
        existingUser = {
            username: username,
            customNickname: username,
            customAvatar: customAvatar,
            zalo: userZalo,
            spins: 0,
            lastLogin: new Date().toISOString()
        };
        users.push(existingUser);
    }

    users.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
    writeUsers(users);

    res.json({
        success: true,
        username: username,
        nickname: customNickname,
        avatar: customAvatar,
        zalo: userZalo,
        spins: userSpins
    });
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true, token: ADMIN_SECRET });
    } else {
        res.status(401).json({ success: false, message: "Mật khẩu Admin không đúng!" });
    }
});

app.post('/api/admin/upload-avatar', verifyAdmin, upload.single('avatarFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "Chưa chọn file!" });
    res.json({ success: true, avatarUrl: `/uploads/${req.file.filename}` });
});

app.get('/api/get-bank-config', (req, res) => {
    res.json(readBanks());
});

app.post('/api/admin/save-bank-list', verifyAdmin, (req, res) => {
    const { banks } = req.body;
    if (!Array.isArray(banks)) {
        return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ!" });
    }
    writeBanks(banks);
    res.json({ success: true, message: "Đã lưu danh sách ngân hàng thành công!" });
});

app.get('/api/admin/users', verifyAdmin, (req, res) => {
    let users = readUsers();
    users.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));
    res.json({ success: true, users: users });
});

app.post('/api/admin/update-user-nickname', verifyAdmin, (req, res) => {
    const { username, customNickname, customAvatar, zalo } = req.body;
    if (!username) return res.status(400).json({ success: false, message: "Thiếu thông tin!" });

    let users = readUsers();
    let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (user) {
        if (customNickname) user.customNickname = customNickname.trim();
        if (customAvatar !== undefined) user.customAvatar = customAvatar.trim();
        if (zalo !== undefined) user.zalo = zalo.trim();
        writeUsers(users);
        res.json({ success: true, message: "Cập nhật thành công!" });
    } else {
        res.status(404).json({ success: false, message: "Không tìm thấy khách hàng!" });
    }
});

// --- API TẠO ĐƠN HÀNG ---
app.post('/api/create-order', (req, res) => {
    const { username, coins, amount } = req.body;
    if (!username || !coins || !amount) {
        return res.status(400).json({ success: false, message: "Thông tin không hợp lệ!" });
    }

    const orderAmount = parseInt(amount);
    const allBanks = readBanks();

    let eligibleBanks = allBanks.filter(b => {
        const isActive = b.active !== false;
        const min = parseInt(b.minAmount || 0);
        const max = parseInt(b.maxAmount || 999999999);
        return isActive && orderAmount >= min && orderAmount <= max;
    });

    if (eligibleBanks.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: `Không có ngân hàng nào hỗ trợ hạn mức thanh toán ${orderAmount.toLocaleString('vi-VN')}đ!` 
        });
    }

    const selectedBank = eligibleBanks[Math.floor(Math.random() * eligibleBanks.length)];

    const orderId = 'HD' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
        id: orderId,
        username: username.replace('@', ''),
        coins: parseInt(coins),
        amount: orderAmount,
        memo: selectedBank.MEMO || 'napxutt KTX',
        bankInfo: {
            bankId: selectedBank.BANK_ID,
            accountNo: selectedBank.ACCOUNT_NO,
            accountName: selectedBank.ACCOUNT_NAME
        },
        billImage: null,
        status: 'PENDING',
        createdAt: new Date().toISOString()
    };

    let orders = readOrders();
    orders.unshift(newOrder);
    writeOrders(orders);

    res.json({
        success: true,
        orderId: orderId,
        memo: newOrder.memo,
        bankInfo: newOrder.bankInfo
    });
});

// --- API UPLOAD BILL CHO ĐƠN HÀNG ---
app.post('/api/upload-order-bill', upload.single('billFile'), (req, res) => {
    const { orderId } = req.body;
    if (!orderId || !req.file) {
        return res.status(400).json({ success: false, message: "Thiếu mã đơn hàng hoặc file ảnh!" });
    }

    let orders = readOrders();
    let order = orders.find(o => o.id === orderId);

    if (order) {
        order.billImage = `/uploads/${req.file.filename}`;
        writeOrders(orders);
        res.json({ success: true, message: "Đã tải ảnh biên lai thành công!", billImage: order.billImage });
    } else {
        res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng!" });
    }
});

// --- VÒNG QUAY MAY MẮN APIs ---
app.get('/api/user-spins/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    let users = readUsers();
    let user = users.find(u => u.username.toLowerCase() === username);
    let spins = user ? (user.spins || 0) : 0;
    res.json({ success: true, spins: spins });
});

app.post('/api/spin-wheel', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: "Thiếu thông tin tài khoản!" });

    let users = readUsers();
    let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user || (user.spins || 0) <= 0) {
        return res.status(400).json({ success: false, message: "Bạn đã hết lượt quay!" });
    }

    user.spins -= 1;

    // Bảng tỷ lệ phần thưởng chuẩn xác 100%
    const prizes = [
        { name: "50 Xu", type: "coin", value: 50, weight: 25 },
        { name: "Giảm đơn tiếp theo 50% (tối đa 10k Xu)", type: "discount_percent", value: 50, maxDiscount: 10000, weight: 25 },
        { name: "200 Xu", type: "coin", value: 200, weight: 15 },
        { name: "500 Xu", type: "coin", value: 500, weight: 10 },
        { name: "Giảm đơn tiếp theo 100k VNĐ", type: "discount_VND", value: 100000, weight: 10 },
        { name: "1.111 Xu", type: "coin", value: 1111, weight: 5 },
        { name: "3.333 Xu", type: "coin", value: 3333, weight: 3 },
        { name: "9.999 Xu", type: "coin", value: 9999, weight: 1 },
        { name: "Mất lượt", type: "none", value: 0, weight: 6 }
    ];

    let totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
    let randomNum = Math.random() * totalWeight;
    let currentWeight = 0;
    let selectedPrize = prizes[0];

    for (let prize of prizes) {
        currentWeight += prize.weight;
        if (randomNum <= currentWeight) {
            selectedPrize = prize;
            break;
        }
    }

    if (!user.spinHistory) user.spinHistory = [];
    user.spinHistory.unshift({
        prize: selectedPrize.name,
        time: new Date().toISOString()
    });

    writeUsers(users);

    res.json({
        success: true,
        prize: selectedPrize,
        remainingSpins: user.spins
    });
});

// --- TỰ ĐỘNG HỦY ĐƠN SAU 15 GIÂY NẾU CHƯA DUYỆT ---
setInterval(() => {
    let orders = readOrders();
    let hasChanges = false;
    let now = new Date();

    orders.forEach(order => {
        if (order.status === 'PENDING') {
            let createdAt = new Date(order.createdAt);
            let diffSeconds = (now - createdAt) / 1000;
            if (diffSeconds > 15) {
                order.status = 'REJECTED';
                hasChanges = true;
            }
        }
    });

    if (hasChanges) {
        writeOrders(orders);
    }
}, 3000);

app.get('/api/check-order-status/:orderId', (req, res) => {
    const orders = readOrders();
    const order = orders.find(o => o.id === req.params.orderId);
    if (order) {
        res.json({ success: true, status: order.status });
    } else {
        res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
});

app.get('/api/my-orders/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    const orders = readOrders();
    const myOrders = orders.filter(o => o.username.toLowerCase() === username);
    res.json({ success: true, orders: myOrders });
});

app.get('/api/public-success-orders', (req, res) => {
    const orders = readOrders();
    const successOrders = orders.filter(o => o.status === 'SUCCESS').slice(0, 10);
    res.json({ success: true, orders: successOrders });
});

app.get('/api/admin/orders', verifyAdmin, (req, res) => {
    res.json({ success: true, orders: readOrders() });
});

// API Admin duyệt đơn (Tự động cộng +1 lượt quay nếu đơn >= 5000 Xu)
app.post('/api/admin/update-order-status', verifyAdmin, (req, res) => {
    const { orderId, status } = req.body;
    let orders = readOrders();
    let order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng!" });
    }

    if (status === 'SUCCESS' && order.status !== 'SUCCESS') {
        order.status = 'SUCCESS';

        // Điều kiện tặng lượt quay: Đơn hàng tối thiểu 5.000 xu được duyệt
        if (order.coins >= 5000) {
            let users = readUsers();
            let user = users.find(u => u.username.toLowerCase() === order.username.toLowerCase());
            if (user) {
                user.spins = (user.spins || 0) + 1;
                writeUsers(users);
            }
        }
    } else {
        order.status = status;
    }

    writeOrders(orders);
    res.json({ success: true, message: "Cập nhật trạng thái thành công!" });
});

app.use('/uploads', express.static(UPLOADS_DIR));

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` Server Backend đang chạy tại: http://localhost:${PORT}`);
    console.log(`==================================================`);
});