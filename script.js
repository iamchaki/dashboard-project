// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAUlnZA9Lsdbahobd7s4r21sdirjAf6OLQ",
    authDomain: "dashboardproject-bb315.firebaseapp.com",
    projectId: "dashboardproject-bb315",
    storageBucket: "dashboardproject-bb315.firebasestorage.app",
    messagingSenderId: "430292777166",
    appId: "1:430292777166:web:d5aec24414ca0ad253389f",
    measurementId: "G-BXMN46GYSZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper for stocks storage check
if (!localStorage.getItem('app_stocks')) localStorage.setItem('app_stocks', JSON.stringify([]));

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let editingStockId = null;
    let globalStockData = [];
    let globalUserData = [];

    // [STEP A] Global Variables for Session & Modal
    let sessionStartTime = Date.now();
    let activeModalUserId = null;

    // --- DOM ELEMENTS ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const navItems = document.querySelectorAll('.nav-links li');
    const views = document.querySelectorAll('.view-section');

    // --- [STEP E] USER DETAILS MODAL LOGIC ---

    // 1. Open Modal (Attached to window so HTML onclick works)
    window.openUserDetails = function (userId) {
        // Find user in global list
        const user = globalUserData.find(u => u.id === userId);
        if (!user) return;

        activeModalUserId = userId;
        const modal = document.getElementById('user-details-modal');
        if (!modal) return; // Guard clause if modal HTML is missing

        // Populate Basic Info
        const usernameEl = document.getElementById('modal-username');
        if (usernameEl) usernameEl.innerText = user.username;

        const emailEl = document.getElementById('detail-email');
        if (emailEl) emailEl.value = user.email;

        // Populate Extended Info (if exists)
        if (document.getElementById('detail-fullname')) document.getElementById('detail-fullname').value = user.fullName || '';
        if (document.getElementById('detail-contact')) document.getElementById('detail-contact').value = user.contact || '';
        if (document.getElementById('detail-blood')) document.getElementById('detail-blood').value = user.bloodGroup || '';
        if (document.getElementById('detail-join-date')) document.getElementById('detail-join-date').value = user.joinDate || '';
        if (document.getElementById('detail-address')) document.getElementById('detail-address').value = user.address || '';
        if (document.getElementById('detail-job-role')) document.getElementById('detail-job-role').value = user.jobRole || user.role || '';

        // Populate Analytics
        // Format Date
        const loginDate = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
        if (document.getElementById('detail-last-login')) document.getElementById('detail-last-login').innerText = loginDate;

        // Format Time Spent (ms to hours/min)
        const ms = user.totalTimeSpent || 0;
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (document.getElementById('detail-time-spent')) document.getElementById('detail-time-spent').innerText = `${hours}h ${mins}m`;

        // Permission Check: Only Admin can edit
        const inputs = document.querySelectorAll('.details-grid input, .details-grid select, .details-grid textarea');
        const saveBtn = document.getElementById('save-details-btn');

        if (currentUser && currentUser.role === 'Admin') {
            inputs.forEach(i => {
                if (i.id !== 'detail-email') i.disabled = false;
            });
            if (saveBtn) saveBtn.style.display = 'block';
        } else {
            inputs.forEach(i => i.disabled = true);
            if (saveBtn) saveBtn.style.display = 'none';
        }

        modal.style.display = 'flex';
    };

    // 2. Close Modal Logic
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('user-details-modal').style.display = 'none';
        });
    }

    // 3. Save Details (Admin Only)
    const saveDetailsBtn = document.getElementById('save-details-btn');
    if (saveDetailsBtn) {
        saveDetailsBtn.addEventListener('click', async () => {
            if (!activeModalUserId || currentUser.role !== 'Admin') return;

            const updates = {
                fullName: document.getElementById('detail-fullname').value,
                contact: document.getElementById('detail-contact').value,
                bloodGroup: document.getElementById('detail-blood').value,
                joinDate: document.getElementById('detail-join-date').value,
                address: document.getElementById('detail-address').value,
                jobRole: document.getElementById('detail-job-role').value
            };

            try {
                await updateDoc(doc(db, "users", activeModalUserId), updates);
                alert("User details updated!");
                document.getElementById('user-details-modal').style.display = 'none';
            } catch (e) {
                alert("Error updating details: " + e.message);
            }
        });
    }

    // --- [STEP C] SESSION TIMER LOGIC ---
    function startSessionTimer(userEmail) {
        sessionStartTime = Date.now();

        // Update time spent every 60 seconds or when window closes
        const updateTime = async () => {
            if (!currentUser) return;

            const now = Date.now();
            const duration = now - sessionStartTime;
            sessionStartTime = now; // Reset for next interval

            try {
                // Find user doc by email
                const q = query(collection(db, "users"), where("email", "==", userEmail));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    const currentTotal = userDoc.data().totalTimeSpent || 0;

                    await updateDoc(doc(db, "users", userDoc.id), {
                        totalTimeSpent: currentTotal + duration
                    });
                }
            } catch (e) { console.error("Time track error", e); }
        };

        // Save every 1 minute
        setInterval(updateTime, 60000);

        // Save when closing tab
        window.addEventListener("beforeunload", updateTime);
    }

    // --- VISUAL RENDERING HELPERS ---

    // Function to render a single stock row
    function renderStockRow(item) {
        const minThreshold = item.minStock || 10;
        const maxStock = 50;
        const percentage = Math.min((item.qty / maxStock) * 100, 100);
        const hue = (percentage * 1.2).toFixed(0);
        const color = `hsl(${hue}, 85%, 45%)`;
        const statusText = item.qty <= minThreshold ? 'Low Stock' : 'Healthy';
        const statusColor = item.qty <= minThreshold ? '#ef4444' : '#10b981';

        const statusGraph = `
            <div style="display:flex; flex-direction:column; gap:4px; min-width: 100px;">
                <div class="stock-graph-container" title="${item.qty} kg in stock" style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                    <div class="stock-graph-fill" style="width: ${percentage}%; height: 100%; background-color: ${color}; transition: width 0.3s ease;"></div>
                </div>
                <div style="display:flex; justify-content: space-between; font-size: 0.75rem;">
                      <span style="color:${statusColor}; font-weight:600;">${statusText}</span>
                      <span style="color:#64748b;">${Math.round(percentage)}%</span>
                </div>
            </div>
        `;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${item.qty} kg</td>
            <td>₹${item.price}</td>
            <td>₹${(item.qty * item.price).toLocaleString()}</td>
            <td>${statusGraph}</td>
            <td>
                ${currentUser && currentUser.role === 'Admin' ? `
                    <button class="edit-stock-btn" data-id="${item.id}" style="background:#4e73df; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; margin-right:5px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="delete-stock-btn" data-id="${item.id}" style="background:#ef4444; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                ` : '<span style="color:#888; font-size:0.8rem;">View Only</span>'}
            </td>
        `;
        return tr;
    }

    // --- [STEP D] UPDATED RENDER USER ROW (Clickable Name) ---
    function renderUserRow(user) {
        const currentStatus = user.status || 'Active';
        const isBlocked = currentStatus === 'Blocked';
        const statusColor = isBlocked ? '#ef4444' : '#10b981';
        const statusIcon = isBlocked ? '<i class="fa-solid fa-ban"></i>' : '●';

        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>
            <div style="display:flex; flex-direction:column;">
                <span class="user-link" style="font-weight:500; cursor:pointer; color:#4e73df;" 
                      onclick="window.openUserDetails('${user.id}')">
                    ${user.username}
                </span>
                <small style="color:#888">${user.email}</small>
            </div>
        </td>
        <td><span class="badge-role ${user.role === 'Admin' ? 'role-admin' : 'role-user'}">${user.role}</span></td>
        <td>
            <span style="color:${statusColor}; font-size:0.9rem; font-weight:600;">
                ${statusIcon} ${currentStatus}
            </span>
        </td>
        <td>
            ${user.email !== currentUser.email ? `
                <button class="toggle-user-btn" data-id="${user.id}" data-status="${currentStatus}" 
                    title="${isBlocked ? 'Unblock User' : 'Block User'}"
                    style="background:none; border:none; color:${isBlocked ? '#10b981' : '#f59e0b'}; cursor:pointer; margin-right:8px; font-size:1.1rem;">
                    <i class="fa-solid ${isBlocked ? 'fa-unlock' : 'fa-ban'}"></i>
                </button>

                <button class="delete-user-btn" data-id="${user.id}" 
                    title="Delete User"
                    style="background:none; border:none; color:#ef4444; cursor:pointer;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : '<span style="color:#ccc; font-size:0.8rem;">Current</span>'}
        </td>
    `;
        return tr;
    }

    // --- SEARCH & FILTER LOGIC ---
    const filterStocks = () => {
        const searchInput = document.getElementById('stock-search');
        const filterSelect = document.getElementById('stock-filter-status');

        if (!searchInput || !filterSelect) return;

        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterSelect.value;
        const tableBody = document.getElementById('stock-table-body');

        const filtered = globalStockData.filter(item => {
            const minThreshold = item.minStock || 10;
            const status = item.qty <= minThreshold ? 'low' : 'healthy';

            const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                item.price.toString().includes(searchTerm) ||
                item.qty.toString().includes(searchTerm);

            const matchesStatus = statusFilter === 'all' || status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        tableBody.innerHTML = '';
        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color:#888;">No matching stocks found.</td></tr>';
        } else {
            filtered.forEach(item => {
                const tr = renderStockRow(item);
                tableBody.appendChild(tr);
            });
        }

        attachStockActionListeners();
    };

    const filterUsers = () => {
        const searchInput = document.getElementById('user-search');
        const roleSelect = document.getElementById('user-filter-role');

        if (!searchInput || !roleSelect) return;

        const searchTerm = searchInput.value.toLowerCase();
        const roleFilter = roleSelect.value;
        const tableBody = document.getElementById('user-table-body');

        const filtered = globalUserData.filter(user => {
            const matchesSearch = user.username.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm) ||
                user.role.toLowerCase().includes(searchTerm);

            const matchesRole = roleFilter === 'all' || user.role === roleFilter;

            return matchesSearch && matchesRole;
        });

        tableBody.innerHTML = '';
        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#888;">No users found.</td></tr>';
        } else {
            filtered.forEach(user => {
                tableBody.appendChild(renderUserRow(user));
            });
        }

        attachUserActionListeners();
    };

    const stockSearch = document.getElementById('stock-search');
    const stockFilter = document.getElementById('stock-filter-status');
    const userSearch = document.getElementById('user-search');
    const userFilter = document.getElementById('user-filter-role');

    if (stockSearch) stockSearch.addEventListener('input', filterStocks);
    if (stockFilter) stockFilter.addEventListener('change', filterStocks);
    if (userSearch) userSearch.addEventListener('input', filterUsers);
    if (userFilter) userFilter.addEventListener('change', filterUsers);

    // --- HELPER: ATTACH BUTTON ACTIONS ---
    function attachStockActionListeners() {
        document.querySelectorAll('.delete-stock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteStock(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.edit-stock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => prepareEditStock(e.target.closest('button').dataset.id));
        });
    }

    function attachUserActionListeners() {
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteUser(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.toggle-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnEl = e.target.closest('button');
                toggleUserStatus(btnEl.dataset.id, btnEl.dataset.status);
            });
        });
    }

    // --- AUTH & LOGIN LOGIC ---
    loginBtn.addEventListener('click', async () => {
        const usernameInput = document.getElementById('login-username').value.trim();
        const email = usernameInput.includes('@') ? usernameInput : `${usernameInput}@veggiestock.com`;
        const pass = document.getElementById('login-password').value;
        const errorMsg = document.getElementById('login-error');

        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            console.error("Login Error:", error);
            if (error.code === 'auth/invalid-email') {
                errorMsg.innerText = "Invalid username format.";
            } else if (error.code === 'auth/invalid-credential') {
                errorMsg.innerText = "Wrong password or user not found.";
            } else {
                errorMsg.innerText = "Login failed: " + error.message;
            }
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let userRole = 'User';
            let userName = user.email;
            let userStatus = 'Active';

            try {
                const q = query(collection(db, "users"), where("email", "==", user.email));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    const docId = querySnapshot.docs[0].id;
                    userRole = userData.role;
                    userName = userData.username;
                    userStatus = userData.status || 'Active';

                    // --- [STEP B] TRACK LAST LOGIN ---
                    await updateDoc(doc(db, "users", docId), {
                        lastLogin: new Date().toISOString()
                    });
                } else if (user.email === 'admin@veggiestock.com') {
                    userRole = 'Admin';
                    userStatus = 'Active';
                }

                // --- SECURITY CHECK: ENFORCE BLOCK ---
                if (userStatus === 'Blocked') {
                    await signOut(auth);
                    alert("Access Denied: Your account has been blocked by the Administrator.");
                    window.location.reload();
                    return;
                }
            } catch (e) {
                console.error("Error fetching role:", e);
            }

            currentUser = { username: userName, email: user.email, role: userRole };

            // --- [STEP B & C] START TIMER ---
            startSessionTimer(user.email);

            initApp();
        } else {
            mainApp.style.display = 'none';
            loginScreen.style.display = 'flex';
        }
    });

    function initApp() {
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';

        document.body.classList.remove('theme-user');
        if (currentUser.role === 'User') {
            document.body.classList.add('theme-user');
            document.getElementById('profile-img').style.borderColor = '#10b981';
        } else {
            document.getElementById('profile-img').style.borderColor = '#4e73df';
        }

        document.getElementById('profile-name').innerText = currentUser.username;
        document.getElementById('profile-role').innerText = currentUser.role;
        document.getElementById('date-display').innerText = `Welcome back, ${currentUser.username}`;

        const usersLink = document.getElementById('nav-users');
        if (currentUser.role !== 'Admin') {
            usersLink.style.display = 'none';
        } else {
            usersLink.style.display = 'block';
        }

        startRealTimeData();
        switchView('dashboard');
    }

    // --- [STEP F] SIDEBAR PROFILE CLICK (View Own Details) ---
    const profileSection = document.querySelector('.profile-section');
    if (profileSection) {
        profileSection.addEventListener('click', async () => {
            if (!currentUser) return;

            let myId = null;

            // Attempt to find in global list
            const found = globalUserData.find(u => u.email === currentUser.email);
            if (found) {
                myId = found.id;
            } else {
                // Fallback fetch if list not loaded (e.g. non-admin filtering)
                try {
                    const q = query(collection(db, "users"), where("email", "==", currentUser.email));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        myId = snap.docs[0].id;
                        // Push to global for the modal function to work
                        // Check if already exists to avoid dupes
                        if (!globalUserData.find(u => u.id === myId)) {
                            globalUserData.push({ ...snap.docs[0].data(), id: myId });
                        }
                    }
                } catch (e) { console.error("Error fetching own profile", e); }
            }

            if (myId) {
                window.openUserDetails(myId);
            }
        });
    }

    // --- REAL-TIME DATA LISTENERS ---
    function startRealTimeData() {
        onSnapshot(collection(db, "stocks"), (snapshot) => {
            globalStockData = [];
            snapshot.forEach((docSnap) => {
                const item = docSnap.data();
                globalStockData.push({ ...item, id: docSnap.id });
            });
            filterStocks();
            updateDashboardCards();
        });

        // Note: Non-admins might fail this listener depending on security rules.
        // We wrap it in a try-catch logic concept, or rely on Firebase rules to just return empty/error.
        onSnapshot(collection(db, "users"), (snapshot) => {
            globalUserData = [];
            snapshot.forEach((docSnap) => {
                const user = docSnap.data();
                globalUserData.push({ ...user, id: docSnap.id });
            });
            filterUsers();
            updateDashboardCards();
        }, (error) => {
            console.log("User listener error (likely permission related):", error);
        });
    }

    // --- DASHBOARD CARDS ---
    function updateDashboardCards() {
        const totalValue = globalStockData.reduce((acc, curr) => acc + (curr.qty * curr.price), 0);
        const lowStockCount = globalStockData.filter(s => s.qty < (s.minStock || 10)).length;
        const stockItemsCount = globalStockData.length;
        const totalUsersCount = globalUserData.length;

        const isCritical = totalValue < 50000;
        const styleRed = "background: #fee2e2; color: #991b1b; border: 1px solid #ef4444;";
        const styleGreen = "background: #d1fae5; color: #065f46; border: 1px solid #10b981;";

        const dataCards = [
            { title: "Inventory Value", value: `₹${totalValue.toLocaleString()}`, icon: "fa-indian-rupee-sign" },
            { title: "Total Users", value: totalUsersCount || "0", icon: "fa-users" },
            { title: "Stock Items", value: stockItemsCount || "0", icon: "fa-boxes-stacked" },
            { title: "Low Stock Alerts", value: lowStockCount || "0", icon: "fa-triangle-exclamation", customStyle: isCritical ? styleRed : styleGreen }
        ];

        const cardsContainer = document.getElementById('cards-container');
        if (!cardsContainer) return;

        cardsContainer.innerHTML = '';
        dataCards.forEach(item => {
            const card = document.createElement('div');
            card.classList.add('card');
            if (item.customStyle) card.style.cssText = item.customStyle;
            card.innerHTML = `
                <div class="card-icon"><i class="fa-solid ${item.icon}"></i></div>
                <h3>${item.title}</h3>
                <p class="value">${item.value}</p>
            `;
            cardsContainer.appendChild(card);
        });
    }

    // --- THEME TOGGLE ---
    const themeBtn = document.getElementById('theme-toggle');
    const themeText = document.getElementById('theme-text');
    const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;

    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
        if (themeText) themeText.innerText = 'Light Mode';
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');

            if (isDark) {
                themeIcon.classList.replace('fa-moon', 'fa-sun');
                themeText.innerText = 'Light Mode';
                localStorage.setItem('theme', 'dark');
            } else {
                themeIcon.classList.replace('fa-sun', 'fa-moon');
                themeText.innerText = 'Dark Mode';
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // --- LOGOUT ---
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        signOut(auth).then(() => {
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        });
    });

    // --- VIEW SWITCHING ---
    function switchView(viewName) {
        views.forEach(view => view.style.display = 'none');

        if (viewName === 'dashboard') {
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'Analytics Overview';
            updateDashboardCards();
        } else if (viewName === 'users') {
            document.getElementById('users-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'User Management';
            filterUsers();
        } else if (viewName === 'stocks') {
            document.getElementById('stocks-section').style.display = 'block';
            document.getElementById('page-title').innerText = 'Stock Inventory';
            if (!editingStockId) {
                const fields = ['veg-name', 'veg-qty', 'veg-price', 'veg-min'];
                fields.forEach(f => { if (document.getElementById(f)) document.getElementById(f).value = ''; });
            }
            filterStocks();
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', function () {
            navItems.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            const viewTarget = this.id.replace('nav-', '');
            switchView(viewTarget);

            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebar-overlay').classList.remove('active');
            }
        });
    });

    // --- USER MANAGEMENT (ADD, DELETE, TOGGLE) ---
    const addUserBtn = document.getElementById('add-user-btn');

    if (addUserBtn) {
        addUserBtn.addEventListener('click', async () => {
            const newName = document.getElementById('new-username').value;
            const newPass = document.getElementById('new-password').value;
            const newRole = document.getElementById('new-role').value;
            const newEmail = newName.includes('@') ? newName : `${newName}@veggiestock.com`;

            if (newName && newPass) {
                try {
                    const secondaryApp = initializeApp(firebaseConfig, "Secondary");
                    const secondaryAuth = getAuth(secondaryApp);
                    await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPass);

                    await addDoc(collection(db, "users"), {
                        username: newName,
                        email: newEmail,
                        role: newRole,
                        status: 'Active',
                        createdAt: new Date().toISOString()
                    });

                    await signOut(secondaryAuth);
                    alert(`User Created!\nEmail: ${newEmail}`);
                    document.getElementById('new-username').value = '';
                    document.getElementById('new-password').value = '';

                } catch (error) {
                    alert("Error creating user: " + error.message);
                }
            } else {
                alert("Please fill in username and password");
            }
        });
    }

    async function deleteUser(id) {
        if (!confirm('Are you sure you want to remove this user?')) return;
        try {
            await deleteDoc(doc(db, "users", id));
        } catch (e) {
            alert("Error deleting: " + e.message);
        }
    }

    async function toggleUserStatus(id, currentStatus) {
        const newStatus = (currentStatus === 'Blocked') ? 'Active' : 'Blocked';
        const actionName = (newStatus === 'Blocked') ? 'BLOCK' : 'UNBLOCK';

        if (!confirm(`Are you sure you want to ${actionName} this user?`)) return;

        try {
            await updateDoc(doc(db, "users", id), {
                status: newStatus
            });
        } catch (e) {
            alert("Error updating status: " + e.message);
        }
    }

    // --- STOCK CRUD OPERATIONS ---

    async function deleteStock(id) {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            await deleteDoc(doc(db, "stocks", id));
        } catch (e) {
            alert("Error deleting stock: " + e.message);
        }
    }

    function prepareEditStock(id) {
        const item = globalStockData.find(s => s.id === id);
        if (!item) return;

        document.getElementById('veg-name').value = item.name;
        document.getElementById('veg-qty').value = item.qty;
        document.getElementById('veg-price').value = item.price;
        const minIn = document.getElementById('veg-min');
        if (minIn) minIn.value = item.minStock || 10;

        const saveBtn = document.getElementById('add-stock-btn');
        saveBtn.innerText = "Update Item";
        saveBtn.style.background = "#4e73df";
        editingStockId = id;

        document.getElementById('veg-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const addStockBtn = document.getElementById('add-stock-btn');
    if (addStockBtn) {
        addStockBtn.addEventListener('click', async () => {
            const name = document.getElementById('veg-name').value;
            const qty = parseFloat(document.getElementById('veg-qty').value);
            const price = parseFloat(document.getElementById('veg-price').value);
            const minStock = parseFloat(document.getElementById('veg-min') ? document.getElementById('veg-min').value : 10);

            if (name && !isNaN(qty) && !isNaN(price)) {
                try {
                    if (editingStockId) {
                        await updateDoc(doc(db, "stocks", editingStockId), {
                            name: name,
                            qty: qty,
                            price: price,
                            minStock: minStock
                        });

                        editingStockId = null;
                        addStockBtn.innerText = "Save Item";
                        addStockBtn.style.background = "#ed8936";
                        alert("Stock updated successfully!");
                    } else {
                        await addDoc(collection(db, "stocks"), {
                            name: name,
                            qty: qty,
                            price: price,
                            minStock: minStock
                        });
                        alert("Stock added to Cloud!");
                    }

                    document.getElementById('veg-name').value = '';
                    document.getElementById('veg-qty').value = '';
                    document.getElementById('veg-price').value = '';
                    if (document.getElementById('veg-min')) document.getElementById('veg-min').value = '';

                } catch (e) {
                    alert("Error saving stock: " + e.message);
                }
            } else {
                alert("Please fill in all fields correctly.");
            }
        });
    }

    // --- SIDEBAR TOGGLE ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebarToggle && sidebar && overlay) {
        const toggleMenu = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };
        sidebarToggle.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);
    }
});
