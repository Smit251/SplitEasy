// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {

    // --- FIREBASE SERVICE CLASS --- //
    class FirebaseService {
        constructor(db, user) {
            this.db = db;
            this.user = user;
        }

        async initUser() {
            const userDocRef = db.collection('users').doc(this.user.uid);
            const userDoc = await userDocRef.get();
            if (!userDoc.exists) {
                await userDocRef.set({
                    name: this.user.displayName || 'New User',
                    email: this.user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        listenToFriends(callback) {
            return db.collection(`users/${this.user.uid}/friends`).onSnapshot(snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        }

        listenToGroups(callback) {
             return db.collection('groups').where('members', 'array-contains', this.user.uid).onSnapshot(snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        }
        
        listenToAllExpenses(callback) {
            return db.collection('expenses').where('participants', 'array-contains', this.user.uid).orderBy('date', 'desc').onSnapshot(snapshot => {
                const expenses = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        date: data.date.toDate ? data.date.toDate().toISOString().split('T')[0] : data.date 
                    };
                });
                callback(expenses);
            }, error => console.error("Expense listener failed:", error));
        }

        async addFriend(data) { await db.collection(`users/${this.user.uid}/friends`).add(data); }
        async deleteFriend(id) { await db.collection(`users/${this.user.uid}/friends`).doc(id).delete(); }
        async addGroup(data) { await db.collection('groups').add({ ...data, members: [this.user.uid, ...data.members], createdBy: this.user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }
        async updateGroup(id, data) { await db.collection('groups').doc(id).update(data); }
        async deleteGroup(id) { await db.collection('groups').doc(id).delete(); }
        async addExpense(data) { await db.collection('expenses').add({ ...data, date: new Date(data.date), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }
        async updateExpense(id, data) { await db.collection('expenses').doc(id).update({ ...data, date: new Date(data.date) }); }
        async deleteExpense(id) { await db.collection('expenses').doc(id).delete(); }
    }

    // --- CALCULATIONS CLASS --- //
    class Calculations {
        static getBalances(expenses, userId) {
            const balances = new Map();
            let totalOwed = 0;
            let totalYouOwe = 0;

            for (const expense of expenses.filter(e => !e.isPayment)) {
                const payerId = expense.paidById;
                const userSplit = expense.splits.find(s => s.friendId === userId);

                if (payerId === userId) {
                    for (const split of expense.splits) {
                        if (split.friendId !== userId) {
                            balances.set(split.friendId, (balances.get(split.friendId) || 0) + split.amount);
                        }
                    }
                } else if (userSplit) {
                    balances.set(payerId, (balances.get(payerId) || 0) - userSplit.amount);
                }
            }
            
            for (const payment of expenses.filter(e => e.isPayment)) {
                if(payment.paidById === userId) {
                     balances.set(payment.receiverId, (balances.get(payment.receiverId) || 0) + payment.amount);
                } else if (payment.receiverId === userId) {
                     balances.set(payment.paidById, (balances.get(payment.paidById) || 0) - payment.amount);
                }
            }

            for (const amount of balances.values()) {
                if (amount > 0) totalOwed += amount;
                else totalYouOwe += Math.abs(amount);
            }

            return { balances, totalOwed, totalYouOwe };
        }
        static getSpendingByMonth(expenses) {
            const monthlySpending = {};
            const nonPaymentExpenses = expenses.filter(e => !e.isPayment);

            for (const expense of nonPaymentExpenses) {
                const monthKey = expense.date.slice(0, 7); // YYYY-MM
                if (!monthlySpending[monthKey]) {
                    monthlySpending[monthKey] = 0;
                }
                monthlySpending[monthKey] += expense.amount;
            }
            return monthlySpending;
        }
    }
    
    // --- FORM TEMPLATES CLASS --- //
    class FormTemplates {
        static addFriend() {
            const defaultAvatars = ['😀', '😎', '🧑‍💻', '🎨', '🎉', '🚀', '💡', '🤖', '😊', '🥳', '🤩', '🤔'];
            const defaultAvatar = defaultAvatars[0];

            return `
                <form id="add-friend-form" class="flex flex-col flex-1 overflow-hidden">
                    <div class="p-4 border-b">
                        <h3 class="text-lg font-bold text-center">Add a Friend</h3>
                    </div>
                    <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Name</label>
                                <input type="text" name="name" class="form-input w-full mt-1 p-2 rounded-md" required autocomplete="off">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Avatar</label>
                                <input type="hidden" name="avatar" id="selected-avatar" value="${defaultAvatar}">
                                <div id="avatar-picker" class="mt-2 grid grid-cols-6 gap-2">
                                    ${defaultAvatars.map((avatar, index) => `
                                        <div class="avatar-option cursor-pointer text-3xl text-center p-2 rounded-lg border-2 ${index === 0 ? 'border-teal-500 ring-2 ring-teal-200' : 'border-transparent'} hover:bg-gray-100" data-avatar="${avatar}">
                                            ${avatar}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 border-t flex justify-end gap-2">
                        <button type="button" class="modal-close-btn px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-semibold">Add Friend</button>
                    </div>
                </form>
            `;
        }
        static addGroup(state, group = {}) {
            const isEditing = !!group.id;
            const groupAvatars = ['🏡', '🚗', '✈️', '🍽️', '🎉', '🎁', '💼', '💻', '🏖️', '🎵', '🎬', '💪'];
            const defaultAvatar = group.avatar || groupAvatars[0];
            return `
                <form id="add-group-form" class="flex flex-col flex-1 overflow-hidden">
                    <div class="p-4 border-b">
                        <h3 class="text-lg font-bold text-center">${isEditing ? 'Edit Group' : 'Create a New Group'}</h3>
                        <input type="hidden" name="groupId" value="${group.id || ''}">
                    </div>
                    <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Group Name</label>
                                <input type="text" name="name" class="form-input w-full mt-1 p-2 rounded-md" value="${group.name || ''}" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Group Icon</label>
                                <input type="hidden" name="avatar" id="selected-avatar" value="${defaultAvatar}">
                                <div id="avatar-picker" class="mt-2 grid grid-cols-6 gap-2">
                                    ${groupAvatars.map(avatar => `
                                        <div class="avatar-option cursor-pointer text-3xl text-center p-2 rounded-lg border-2 ${avatar === defaultAvatar ? 'border-teal-500 ring-2 ring-teal-200' : 'border-transparent'} hover:bg-gray-100" data-avatar="${avatar}">
                                            ${avatar}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Members</label>
                                <div class="member-input-container mt-2">
                                    <div class="selected-members"></div>
                                    <input type="text" class="member-search-input" placeholder="Search for friends...">
                                    <div class="friend-list-dropdown"></div>
                                </div>
                                <div class="hidden-members"></div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 border-t flex justify-end gap-2">
                        <button type="button" class="modal-close-btn px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-semibold">${isEditing ? 'Save Changes' : 'Create Group'}</button>
                    </div>
                </form>
            `;
        }
        
        static addExpense(state, expense = {}) {
            const isEditing = !!expense.id;
            const categories = ['Food', 'Transport', 'Housing', 'Utilities', 'Travel', 'Entertainment', 'Other'];
            const allPayers = [state.user, ...state.friends];

            let effectiveSplitMethod = expense.splitMethod || 'equal';
            if (isEditing && ['percent', 'shares'].includes(expense.splitMethod)) {
                effectiveSplitMethod = 'exact';
            }

            return `
                <form id="add-expense-form" class="flex flex-col flex-1 overflow-hidden">
                    <div class="p-4 border-b">
                        <h3 class="text-lg font-bold text-center">${isEditing ? 'Edit Expense' : 'Add an Expense'}</h3>
                        <input type="hidden" name="expenseId" value="${expense.id || ''}">
                    </div>
                    <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Description</label>
                                <input type="text" name="description" class="form-input w-full mt-1 p-2 rounded-md" value="${expense.description || ''}" required>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Amount ($)</label>
                                    <input type="number" name="amount" step="0.01" class="form-input w-full mt-1 p-2 rounded-md" value="${expense.amount || ''}" required>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Date</label>
                                    <input type="date" name="date" value="${expense.date || new Date().toISOString().split('T')[0]}" class="form-input w-full mt-1 p-2 rounded-md" required>
                                </div>
                            </div>
                        </div>
                        <div class="space-y-4 border-t pt-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Category</label>
                                    <select name="category" class="form-input w-full mt-1 p-2 rounded-md">${categories.map(c => `<option value="${c}" ${expense.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Group (Optional)</label>
                                    <select name="group" class="form-input w-full mt-1 p-2 rounded-md"><option value="">No Group</option>${state.groups.map(g => `<option value="${g.id}" ${expense.groupId === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}</select>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Paid by</label>
                                <select name="paidBy" class="form-input w-full mt-1 p-2 rounded-md">${allPayers.map(p => `<option value="${p.id}" ${expense.paidById === p.id ? 'selected' : (p.id === state.user.id && !isEditing ? 'selected' : '')}>${p.name}</option>`).join('')}</select>
                            </div>
                        </div>
                        <div class="space-y-4 border-t pt-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Split between</label>
                                <div id="participants-container" class="mt-2"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Split Method</label>
                                ${isEditing && ['percent', 'shares'].includes(expense.splitMethod) ? '<p class="text-xs text-amber-600 bg-amber-50 p-2 rounded-md mt-2">Splits were converted to exact amounts for editing.</p>' : ''}
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                                    <div><input type="radio" id="split-equal" name="splitMethod" value="equal" ${effectiveSplitMethod === 'equal' ? 'checked' : ''} class="sr-only participant-related-control"><label for="split-equal" class="block border rounded-md p-2 text-center text-sm cursor-pointer">Equally</label></div>
                                    <div><input type="radio" id="split-exact" name="splitMethod" value="exact" ${effectiveSplitMethod === 'exact' ? 'checked' : ''} class="sr-only participant-related-control"><label for="split-exact" class="block border rounded-md p-2 text-center text-sm cursor-pointer">Exact</label></div>
                                    <div><input type="radio" id="split-percent" name="splitMethod" value="percent" ${effectiveSplitMethod === 'percent' ? 'checked' : ''} class="sr-only participant-related-control"><label for="split-percent" class="block border rounded-md p-2 text-center text-sm cursor-pointer">Percent</label></div>
                                    <div><input type="radio" id="split-shares" name="splitMethod" value="shares" ${effectiveSplitMethod === 'shares' ? 'checked' : ''} class="sr-only participant-related-control"><label for="split-shares" class="block border rounded-md p-2 text-center text-sm cursor-pointer">Shares</label></div>
                                </div>
                                <div id="split-inputs-container" class="mt-4 space-y-2"></div>
                                <div id="split-validation-msg" class="text-red-500 text-sm mt-2 font-medium"></div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 border-t flex justify-end gap-2">
                        <button type="button" class="modal-close-btn px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-semibold">${isEditing ? 'Save Changes' : 'Add Expense'}</button>
                    </div>
                </form>
            `;
        }
        static settleUp(state) {
            const friends = state.friends;
            return `
                <form id="settle-up-form" class="flex flex-col flex-1 overflow-hidden">
                    <div class="p-4 border-b">
                        <h3 class="text-lg font-bold text-center">Record a Payment</h3>
                    </div>
                    <div class="p-6 space-y-6 flex-1 overflow-y-auto">
                        <div class="grid grid-cols-2 gap-2">
                            <div><input type="radio" id="payment-sent" name="paymentDirection" value="sent" checked class="sr-only"><label for="payment-sent" class="block border rounded-md p-3 text-center text-sm cursor-pointer">You paid</label></div>
                            <div><input type="radio" id="payment-received" name="paymentDirection" value="received" class="sr-only"><label for="payment-received" class="block border rounded-md p-3 text-center text-sm cursor-pointer">You received</label></div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">To/From</label>
                            <select name="friend" class="form-input w-full mt-1 p-2 rounded-md" required>
                                <option value="">Select a friend</option>
                                ${friends.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Amount ($)</label>
                                <input type="number" name="amount" step="0.01" class="form-input w-full mt-1 p-2 rounded-md" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Date</label>
                                <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full mt-1 p-2 rounded-md" required>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 border-t flex justify-end gap-2">
                        <button type="button" class="modal-close-btn px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 font-semibold">Cancel</button>
                        <button type="submit" class="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-semibold">Record Payment</button>
                    </div>
                </form>
            `;
        }
        static confirmDelete({ title, message, confirmText = 'Delete' }) {
            return `
                <div class="flex flex-col">
                    <div class="p-6 text-center">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                            <span class="material-icons-sharp text-red-600">warning_amber</span>
                        </div>
                        <h3 class="text-lg font-bold mt-4">${title}</h3>
                        <p class="mt-2 text-sm text-gray-600">${message}</p>
                    </div>
                    <div class="p-4 bg-gray-50 flex flex-col sm:flex-row-reverse justify-center gap-3 rounded-b-lg sm:rounded-b-md">
                        <button id="confirm-delete-btn" class="px-6 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold w-full sm:w-auto">${confirmText}</button>
                        <button type="button" class="modal-close-btn px-6 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 font-semibold w-full sm:w-auto">Cancel</button>
                    </div>
                </div>
            `;
        }
    }

    // --- UI CLASS --- //
    class UI {
        constructor(app) {
            this.app = app;
            this.mainContent = document.getElementById('main-content');
            this.modalContainer = document.getElementById('modal-container');
            this.modalContentWrapper = document.getElementById('modal-content-wrapper');
            this.charts = {};
        }
        
        renderPage(page) {
            if (!this.mainContent) return;
            this.mainContent.innerHTML = '';
            switch(page) {
                case 'dashboard': this.renderDashboard(); break;
                case 'friends': this.renderFriendsPage(); break;
                case 'groups': this.renderGroupsPage(); break;
                case 'activity': this.renderActivityPage(); break;
            }
        }

        renderDashboard() {
            const { balances, totalOwed, totalYouOwe } = Calculations.getBalances(this.app.state.expenses, this.app.user.uid);
            const monthlySpending = Calculations.getSpendingByMonth(this.app.state.expenses);
            const currentMonthKey = new Date().toISOString().slice(0, 7);
            const currentMonthSpending = monthlySpending[currentMonthKey] || 0;

            const sortedMonths = Object.keys(monthlySpending).sort().reverse();
            const previousMonths = sortedMonths
                .filter(month => month !== currentMonthKey)
                .slice(0, 3);
            this.mainContent.innerHTML = `
                <div class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">Dashboard</h2>
                        <button id="settle-up-btn" class="bg-teal-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-teal-700 flex items-center gap-2">
                            <span class="material-icons-sharp">paid</span> Settle Up
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-6">
                        <div class="bg-white shadow rounded-lg p-4 text-center border-t-4 border-green-500">
                            <p class="text-sm text-gray-500 font-medium">You are owed</p>
                            <p class="text-3xl font-bold text-gray-800 mt-1">$${totalOwed.toFixed(2)}</p>
                        </div>
                        <div class="bg-white shadow rounded-lg p-4 text-center border-t-4 border-red-500">
                            <p class="text-sm text-gray-500 font-medium">You owe</p>
                            <p class="text-3xl font-bold text-gray-800 mt-1">$${totalYouOwe.toFixed(2)}</p>
                        </div>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow">
                        <h3 class="font-bold text-lg mb-3">Balances</h3>
                        <div class="space-y-4">
                            ${[...balances.entries()].map(([friendId, amount]) => {
                                if (Math.abs(amount) < 0.01) return '';
                                const friend = this.app.state.friends.find(f => f.id === friendId);
                                if (!friend) return '';
                                const owesYou = amount > 0;
                                const absAmount = Math.abs(amount);
                                return `
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <span class="text-3xl">${friend.avatar}</span>
                                            <div>
                                                <p class="font-semibold">${friend.name}</p>
                                                <p class="text-sm font-medium ${owesYou ? 'text-green-600' : 'text-red-600'}">
                                                    ${owesYou ? `Owes you $${absAmount.toFixed(2)}` : `You owe $${absAmount.toFixed(2)}`}
                                                </p>
                                            </div>
                                        </div>
                                        <button class="direct-settle-btn bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-1 px-3 rounded-md"
                                            data-friend-id="${friend.id}"
                                            data-amount="${absAmount}"
                                            data-direction="${owesYou ? 'received' : 'sent'}">
                                            Settle
                                        </button>
                                    </div>
                                `;
                            }).filter(Boolean).join('') || '<p class="text-gray-500 text-center py-4">All settled up!</p>'}
                        </div>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow">
                        <h3 class="font-bold text-lg mb-2">Recent Activity</h3>
                        <div class="space-y-3">
                            ${this.renderRecentActivity()}
                        </div>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow">
                        <h3 class="font-bold text-lg mb-4">Spending Breakdown</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="relative h-80"><canvas id="categoryChart"></canvas></div>
                            <div>
                                <div class="bg-gray-50 rounded-lg p-6 text-center">
                                    <p class="text-sm text-gray-500 font-medium uppercase tracking-wider">This Month's Spending</p>
                                    <p class="text-4xl font-bold text-gray-800 mt-2">$${currentMonthSpending.toFixed(2)}</p>
                                </div>
                                <div class="mt-6 space-y-3">
                                    <h4 class="font-semibold text-sm text-gray-600">Previous Months</h4>
                                    ${previousMonths.length > 0 ? previousMonths.map(monthKey => {
                                        const date = new Date(monthKey + '-02'); // Use day 2 to avoid timezone issues
                                        const monthName = date.toLocaleString('default', { month: 'long' });
                                        return `
                                            <div class="flex justify-between items-center text-sm">
                                                <span class="text-gray-500">${monthName} ${date.getFullYear()}</span>
                                                <span class="font-medium text-gray-700">$${monthlySpending[monthKey].toFixed(2)}</span>
                                            </div>
                                        `;
                                    }).join('') : '<p class="text-sm text-gray-400 text-center py-4">No spending recorded in previous months.</p>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            this.renderDashboardCharts();
        }

        renderDashboardCharts() {
            // Destroy existing charts to prevent memory leaks
            if (this.charts.categoryChart) this.charts.categoryChart.destroy();
            if (this.charts.spendingChart) {
                this.charts.spendingChart.destroy();
                delete this.charts.spendingChart;
            }

            const expenses = this.app.state.expenses.filter(e => !e.isPayment);
            const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');

            if (categoryCtx) {
                const categoryData = expenses.reduce((acc, expense) => {
                    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
                    return acc;
                }, {});

                this.charts.categoryChart = new Chart(categoryCtx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(categoryData),
                        datasets: [{
                            label: 'Spending by Category',
                            data: Object.values(categoryData),
                            backgroundColor: ['#14b8a6', '#f97316', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#6b7280'],
                            hoverOffset: 4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
            }
        }

        renderFriendsPage() {
            this.mainContent.innerHTML = `
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">Friends</h2>
                        <button id="add-friend-btn" class="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700">Add Friend</button>
                    </div>
                    <div id="friends-list" class="space-y-2">
                        ${this.app.state.friends.map(friend => `
                            <div class="flex items-center justify-between p-4 bg-white rounded-lg shadow">
                                <div class="flex items-center gap-4">
                                    <span class="text-3xl">${friend.avatar}</span>
                                    <span>${friend.name}</span>
                                </div>
                                <button data-friend-id="${friend.id}" class="delete-friend-btn p-2 text-gray-500 hover:text-red-600 rounded-full"><span class="material-icons-sharp text-xl">delete</span></button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        renderGroupsPage() {
            this.mainContent.innerHTML = `
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <button id="add-group-btn" class="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700">Add Group</button>
                    </div>
                    <div id="groups-list" class="space-y-2">
                        ${this.app.state.groups.map(group => `
                            <div class="group-item flex items-center justify-between p-4 bg-white rounded-lg shadow cursor-pointer hover:bg-gray-50" data-group-id="${group.id}">
                                <div class="flex items-center gap-3">
                                    <span class="text-3xl">${group.avatar || '📁'}</span>
                                    <div>
                                        <h3 class="font-bold">${group.name}</h3>
                                        <p class="text-sm text-gray-500">${group.members.length} members</p>
                                    </div>
                                </div>
                                <div class="flex items-center">
                                    <button class="edit-group-btn p-2 text-gray-500 hover:text-teal-600 rounded-full" data-group-id="${group.id}"><span class="material-icons-sharp text-xl">edit</span></button>
                                    <button data-group-id="${group.id}" class="delete-group-btn text-red-500 hover:text-red-700 z-10 relative p-2 -mr-2">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        renderActivityPage() {
            const expenses = this.app.state.expenses;
            const allUsers = [this.app.state.user, ...this.app.state.friends];
            const findName = (id) => allUsers.find(u => u.id === id)?.name || 'Unknown';

            this.mainContent.innerHTML = `
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">All Activity</h2>
                    </div>
                    <div id="activity-list" class="space-y-3">
                        ${expenses.length === 0 ? '<p class="text-gray-500 text-center p-4">No activity yet.</p>' : ''}
                        ${[...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map(expense => {
                            if (expense.isPayment) {
                                const payerName = findName(expense.paidById);
                                const receiverName = findName(expense.receiverId);
                                const description = payerName === 'You' 
                                    ? `You paid ${receiverName}` 
                                    : `${payerName} paid you`;
                                return `
                                    <div class="bg-white p-4 rounded-lg shadow">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <p class="font-semibold text-green-700">Payment</p>
                                                <p class="text-lg font-bold text-green-600">$${expense.amount.toFixed(2)}</p>
                                                <p class="text-sm text-gray-500">${description} on ${expense.date}</p>
                                            </div>
                                            <div class="flex gap-1">
                                                <button class="delete-expense-btn p-2 text-gray-500 hover:text-red-600 rounded-full" data-expense-id="${expense.id}"><span class="material-icons-sharp text-xl">delete</span></button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            } else {
                                return `
                                    <div class="bg-white p-4 rounded-lg shadow">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <p class="font-semibold">${expense.description}</p>
                                                <p class="text-xl font-bold text-gray-800">$${expense.amount.toFixed(2)}</p>
                                                <p class="text-sm text-gray-500">Paid by ${findName(expense.paidById)} on ${expense.date}</p>
                                            </div>
                                            <div class="flex gap-1">
                                                <button class="edit-expense-btn p-2 text-gray-500 hover:text-teal-600 rounded-full" data-expense-id="${expense.id}"><span class="material-icons-sharp text-xl">edit</span></button>
                                                <button class="delete-expense-btn p-2 text-gray-500 hover:text-red-600 rounded-full" data-expense-id="${expense.id}"><span class="material-icons-sharp text-xl">delete</span></button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }
                        }).join('')}
                    </div>
                </div>
            `;
        }

        renderGroupDetailPage(group) {
            const groupExpenses = this.app.state.expenses.filter(e => e.groupId === group.id);
            const { balances } = Calculations.getBalances(groupExpenses, this.app.user.uid);
            const allUsers = [this.app.state.user, ...this.app.state.friends];
            const findUser = (id) => allUsers.find(u => u.id === id);

            this.mainContent.innerHTML = `
                <div class="space-y-6">
                    <div>
                        <button id="back-to-groups" class="text-teal-600 font-semibold mb-4 flex items-center gap-1"><span class="material-icons-sharp">arrow_back</span> Back to all groups</button>
                        <div class="flex justify-between items-center">
                            <h2 class="text-3xl font-bold flex items-center gap-3"><span class="text-4xl">${group.avatar || '📁'}</span> ${group.name}</h2>
                            <button class="edit-group-btn bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg flex items-center gap-2" data-group-id="${group.id}"><span class="material-icons-sharp">edit</span> Edit Group</button>
                        </div>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow"><h3 class="font-bold text-lg mb-2">Group Balances</h3>
                        <div class="space-y-2">${[...balances.entries()].map(([friendId, amount]) => {
                                const friend = findUser(friendId);
                                if (!friend || Math.abs(amount) < 0.01) return '';
                                return `<div class="flex justify-between items-center"><span>${friend.name}</span><span class="font-semibold ${amount > 0 ? 'text-green-600' : 'text-red-600'}">${amount > 0 ? `owes you $${amount.toFixed(2)}` : `you owe $${Math.abs(amount).toFixed(2)}`}</span></div>`;
                            }).join('') || '<p class="text-gray-500">All settled up in this group!</p>'}
                        </div>
                    </div>
                </div>
            `;
        }

        renderRecentActivity() {
            const recentExpenses = [...this.app.state.expenses]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
            
            if (recentExpenses.length === 0) {
                return '<p class="text-gray-500 text-center p-2">No recent activity.</p>';
            }

            const allUsers = [this.app.state.user, ...this.app.state.friends];
            const findName = (id) => allUsers.find(u => u.id === id)?.name || 'Unknown';

            return recentExpenses.map(expense => {
                if (expense.isPayment) {
                    const payerName = findName(expense.paidById);
                    const receiverName = findName(expense.receiverId);
                    const description = payerName === 'You' 
                        ? `You paid ${receiverName}` 
                        : `${payerName} paid you`;
                    return `
                        <div class="flex justify-between items-center py-1">
                            <div>
                                <p class="font-semibold text-green-600">${description}</p>
                                <p class="text-sm text-gray-500">${expense.date}</p>
                            </div>
                            <p class="font-bold text-green-600">$${expense.amount.toFixed(2)}</p>
                        </div>
                    `;
                } else {
                    return `
                        <div class="flex justify-between items-center py-1">
                            <div>
                                <p class="font-semibold">${expense.description}</p>
                                <p class="text-sm text-gray-500">Paid by ${findName(expense.paidById)}</p>
                            </div>
                            <p class="font-bold text-gray-800">$${expense.amount.toFixed(2)}</p>
                        </div>
                    `;
                }
            }).join('');
        }

        openModal(content) {
            this.modalContentWrapper.innerHTML = content;
            this.modalContainer.classList.add('active');
        }
        closeModal() {
            this.modalContainer.classList.remove('active');
            this.modalContentWrapper.innerHTML = '';
        }
        showConfirmModal(options, onConfirm) {
            const content = FormTemplates.confirmDelete(options);
            this.openModal(content);

            const confirmBtn = this.modalContainer.querySelector('#confirm-delete-btn');
            if (confirmBtn) {
                const confirmHandler = () => {
                    onConfirm();
                    this.closeModal();
                };
                confirmBtn.addEventListener('click', confirmHandler, { once: true });
            }
        }
        showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }, 10);
        }
        updateNav(page) {
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.page === page);
            });
        }
    }


    // --- APP CLASS --- //
    class App {
        constructor(user) {
            this.user = user;
            this.db = db;
            this.firebaseService = new FirebaseService(this.db, this.user);
            
            this.ui = new UI(this);
            this.currentPage = 'dashboard';
            this.currentGroup = null;
            
            this.state = {
                user: { id: user.uid, name: user.displayName || 'You', photoURL: user.photoURL },
                friends: [],
                groups: [],
                expenses: [],
            };
            this.unsubscribers = [];
            this.init();
        }

        async init() {
            const userInfoEl = document.getElementById('user-info');
            if (userInfoEl) {
                userInfoEl.innerHTML = `
                    <img src="${this.user.photoURL || `https://ui-avatars.com/api/?name=${this.user.displayName}&background=random`}" alt="avatar" class="w-8 h-8 rounded-full">
                    <span class="font-semibold hidden md:inline">${this.user.displayName || 'User'}</span>
                `;
            }
            await this.firebaseService.initUser();
            this.attachDataListeners();
            this.addEventListeners();
        }
        
        attachDataListeners() {
            this.unsubscribers.push(this.firebaseService.listenToFriends(friends => { this.state.friends = friends; this.refreshUI(); }));
            this.unsubscribers.push(this.firebaseService.listenToGroups(groups => { this.state.groups = groups; this.refreshUI(); }));
            this.unsubscribers.push(this.firebaseService.listenToAllExpenses(expenses => {
                this.state.expenses = expenses;
                const spinner = document.getElementById('loading-spinner');
                if (spinner) spinner.style.display = 'none';
                this.refreshUI();
            }));
        }
        
        addEventListeners() {
            const nav = document.querySelector('nav');
            if (nav) {
                nav.addEventListener('click', e => {
                    const target = e.target.closest('.nav-item');
                    if (target) {
                        this.currentGroup = null;
                        this.currentPage = target.dataset.page;
                        this.refreshUI();
                    }
                });
            }

            const fab = document.getElementById('fab-add-expense');
            if (fab) {
                fab.addEventListener('click', () => {
                     this.ui.openModal(FormTemplates.addExpense(this.state));
                     this.updateParticipants(document.getElementById('add-expense-form'));
                     this.updateSplitInputs();
                });
            }

            document.body.addEventListener('click', e => {
                const logoutBtn = e.target.closest('#logout-btn');
                if (logoutBtn) {
                    auth.signOut();
                }
                if (e.target.closest('.modal-close-btn') || e.target.id === 'modal-container') this.ui.closeModal();
                if (e.target.id === 'add-friend-btn') {
                    this.ui.openModal(FormTemplates.addFriend());
                }
                if (e.target.id === 'settle-up-btn') {
                    this.ui.openModal(FormTemplates.settleUp(this.state));
                }
                if (e.target.id === 'add-group-btn') {
                    this.ui.openModal(FormTemplates.addGroup(this.state));
                    this.initMemberInput(document.querySelector('#add-group-form .member-input-container'), this.state.friends, { inputName: 'members' });
                }
                if (e.target.classList.contains('delete-friend-btn')) {
                    this.handleDeleteFriend(e.target.dataset.friendId);
                }
                const editBtn = e.target.closest('.edit-expense-btn');
                if (editBtn) {
                    this.handleEditExpense(editBtn.dataset.expenseId);
                }
                const deleteExpenseBtn = e.target.closest('.delete-expense-btn');
                if (deleteExpenseBtn) {
                    this.handleDeleteExpense(deleteExpenseBtn.dataset.expenseId);
                }
                const editGroupBtn = e.target.closest('.edit-group-btn');
                if (editGroupBtn) {
                    this.handleOpenEditGroup(editGroupBtn.dataset.groupId);
                }
                const groupItem = e.target.closest('.group-item');
                const deleteGroupBtn = e.target.closest('.delete-group-btn');
                if (deleteGroupBtn) { this.handleDeleteGroup(deleteGroupBtn.dataset.groupId); } 
                else if (groupItem) { this.currentGroup = this.state.groups.find(g => g.id === groupItem.dataset.groupId); this.refreshUI(); }
                const settleBtn = e.target.closest('.direct-settle-btn');
                if (settleBtn) {
                    const { friendId, amount, direction } = settleBtn.dataset;
                    this.handleDirectSettleUp(friendId, parseFloat(amount), direction);
                }
                if (e.target.id === 'back-to-groups') { this.currentGroup = null; this.refreshUI(); }
            });
            
            this.ui.modalContainer.addEventListener('click', e => {
                const avatarPicker = e.target.closest('#avatar-picker');
                if (avatarPicker) {
                    const target = e.target.closest('.avatar-option');
                    if (target) {
                        const selectedAvatarInput = document.getElementById('selected-avatar');
                        // Remove selected class from all others
                        avatarPicker.querySelectorAll('.avatar-option').forEach(el => {
                            el.classList.remove('border-teal-500', 'ring-2', 'ring-teal-200');
                            el.classList.add('border-transparent');
                        });
                        // Add selected class to the clicked one
                        target.classList.add('border-teal-500', 'ring-2', 'ring-teal-200');
                        target.classList.remove('border-transparent');
                        if (selectedAvatarInput) selectedAvatarInput.value = target.dataset.avatar;
                    }
                }
            });

            document.body.addEventListener('submit', e => {
                e.preventDefault();
                if (e.target.id === 'add-expense-form') this.handleAddExpense(e.target);
                if (e.target.id === 'add-friend-form') this.handleAddFriend(e.target);
                if (e.target.id === 'settle-up-form') this.handleSettleUp(e.target);
                if (e.target.id === 'add-group-form') {
                    const groupId = e.target.querySelector('input[name="groupId"]').value;
                    if (groupId) {
                        this.handleUpdateGroup(e.target);
                    } else {
                        this.handleAddGroup(e.target);
                    }
                }
            });

            document.body.addEventListener('change', e => {
                const form = e.target.closest('#add-expense-form');
                if (!form) return;
                if (e.target.name === 'group' || e.target.name === 'participants') {
                    this.updateParticipants(form); // This will re-render the member input
                    this.updateSplitInputs();
                } else if (e.target.name === 'splitMethod') {
                    this.updateSplitInputs();
                }
            });

            document.body.addEventListener('participantsChange', e => {
                const form = e.target.closest('#add-expense-form');
                if (form) {
                    this.updateSplitInputs();
                }
            });

             document.body.addEventListener('input', e => {
                const form = e.target.closest('#add-expense-form');
                if (!form) return;
                if (e.target.name === 'amount' || e.target.classList.contains('split-input')) {
                   this.validateSplits();
                }
            });
        }

        async handleAddExpense(form) {
            const formData = new FormData(form);
            const expenseId = formData.get('expenseId');
            const isEditing = !!expenseId;

            const amount = parseFloat(formData.get('amount'));
            if (isNaN(amount) || amount <= 0) {
                this.ui.showToast('Please enter a valid amount.', 'error');
                return;
            }

            const participants = Array.from(form.querySelectorAll('.hidden-members input')).map(p => p.value);
            if (participants.length === 0) {
                this.ui.showToast('Please select at least one person to split with.', 'error');
                return;
            }

            const validation = this.validateSplits(true);
            if (!validation.isValid) {
                this.ui.showToast(validation.message, 'error');
                return;
            }

            const expenseData = {
                description: formData.get('description'),
                amount,
                date: formData.get('date'),
                category: formData.get('category'),
                groupId: formData.get('group') || null,
                paidById: formData.get('paidBy'),
                splitMethod: formData.get('splitMethod'),
                splits: validation.splits,
                participants,
            };

            try {
                if (isEditing) {
                    await this.firebaseService.updateExpense(expenseId, expenseData);
                    this.ui.showToast('Expense updated successfully!', 'success');
                } else {
                    await this.firebaseService.addExpense(expenseData);
                    this.ui.showToast('Expense added successfully!', 'success');
                }
                this.ui.closeModal();
            } catch (error) {
                console.error("Error saving expense:", error);
                this.ui.showToast('Failed to save expense.', 'error');
            }
        }

        async handleAddFriend(form) {
            const formData = new FormData(form);
            const friendData = {
                name: formData.get('name'),
                avatar: formData.get('avatar'),
            };

            try {
                await this.firebaseService.addFriend(friendData);
                this.ui.showToast('Friend added successfully!', 'success');
                this.ui.closeModal();
            } catch (error) {
                console.error("Error adding friend:", error);
                this.ui.showToast('Failed to add friend.', 'error');
            }
        }

        async handleDeleteFriend(friendId) {
            const friend = this.state.friends.find(f => f.id === friendId);
            if (!friend) return;

            this.ui.showConfirmModal({
                title: `Delete ${friend.name}?`,
                message: 'This action cannot be undone. Are you sure you want to delete this friend?'
            }, async () => {
                try {
                    await this.firebaseService.deleteFriend(friendId);
                    this.ui.showToast('Friend deleted successfully!', 'success');
                } catch (error) {
                    console.error("Error deleting friend:", error);
                    this.ui.showToast('Failed to delete friend.', 'error');
                }
            });
        }

        async handleDeleteGroup(groupId) {
            const group = this.state.groups.find(g => g.id === groupId);
            if (!group) return;

            this.ui.showConfirmModal({
                title: `Delete ${group.name}?`,
                message: 'This will not delete the expenses within the group. Are you sure you want to delete this group?'
            }, async () => {
                try {
                    await this.firebaseService.deleteGroup(groupId);
                    this.ui.showToast('Group deleted successfully!', 'success');
                } catch (error) {
                    console.error("Error deleting group:", error);
                    this.ui.showToast('Failed to delete group.', 'error');
                }
            });
        }

        handleOpenEditGroup(groupId) {
            const group = this.state.groups.find(g => g.id === groupId);
            if (!group) {
                this.ui.showToast('Could not find group to edit.', 'error');
                return;
            }
            this.ui.openModal(FormTemplates.addGroup(this.state, group));
            const memberIds = group.members.filter(id => id !== this.user.uid);
            this.initMemberInput(document.querySelector('#add-group-form .member-input-container'), this.state.friends, { inputName: 'members', preselectedIds: memberIds });
        }


        handleEditExpense(expenseId) {
            const expense = this.state.expenses.find(e => e.id === expenseId);
            if (!expense) {
                this.ui.showToast('Could not find expense to edit.', 'error');
                return;
            }
            this.ui.openModal(FormTemplates.addExpense(this.state, expense));
            const form = document.getElementById('add-expense-form');
            this.updateParticipants(form, expense);
            this.updateSplitInputs();
            if (form.querySelector('input[name="splitMethod"][value="exact"]:checked')) {
                expense.splits.forEach(split => {
                    const input = form.querySelector(`.split-input[data-participant-id="${split.friendId}"]`);
                    if (input) input.value = split.amount.toFixed(2);
                });
            }
            this.validateSplits();
        }

        async handleDeleteExpense(expenseId) {
            const expense = this.state.expenses.find(e => e.id === expenseId);
            if (!expense) return;

            const type = expense.isPayment ? 'payment' : 'expense';
            const title = `Delete ${type}?`;
            const message = `Are you sure you want to permanently delete this ${type}? This action cannot be undone.`;

            this.ui.showConfirmModal({ title, message }, async () => {
                try {
                    await this.firebaseService.deleteExpense(expenseId);
                    this.ui.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`, 'success');
                } catch (error) {
                    console.error(`Error deleting ${type}:`, error);
                    this.ui.showToast(`Failed to delete ${type}.`, 'error');
                }
            });
        }

        async handleAddGroup(form) {
            const formData = new FormData(form);
            const members = Array.from(form.querySelectorAll('.hidden-members input')).map(input => input.value);
            const groupData = {
                name: formData.get('name'),
                avatar: formData.get('avatar'),
                members: members,
            };

            if (!groupData.name) {
                this.ui.showToast('Group name is required.', 'error');
                return;
            }

            try {
                await this.firebaseService.addGroup(groupData);
                this.ui.showToast('Group created successfully!', 'success');
                this.ui.closeModal();
            } catch (error) {
                console.error("Error creating group:", error);
                this.ui.showToast('Failed to create group.', 'error');
            }
        }

        async handleUpdateGroup(form) {
            const formData = new FormData(form);
            const groupId = formData.get('groupId');
            const members = Array.from(form.querySelectorAll('.hidden-members input')).map(input => input.value);
            const groupData = {
                name: formData.get('name'),
                avatar: formData.get('avatar'),
                members: [this.user.uid, ...members],
            };

            if (!groupData.name) {
                this.ui.showToast('Group name is required.', 'error');
                return;
            }

            try {
                await this.firebaseService.updateGroup(groupId, groupData);
                this.ui.showToast('Group updated successfully!', 'success');
                this.ui.closeModal();
            } catch (error) {
                console.error("Error updating group:", error);
                this.ui.showToast('Failed to update group.', 'error');
            }
        }

        async handleDirectSettleUp(friendId, amount, direction) {
            const friend = this.state.friends.find(f => f.id === friendId);
            if (!friend) return;

            const title = 'Confirm Settlement';
            const message = direction === 'received'
                ? `Record that you received $${amount.toFixed(2)} from ${friend.name}?`
                : `Record that you paid $${amount.toFixed(2)} to ${friend.name}?`;

            this.ui.showConfirmModal({
                title,
                message,
                confirmText: 'Record Payment'
            }, async () => {
                const paymentData = {
                    isPayment: true,
                    amount,
                    date: new Date().toISOString().split('T')[0], // Use today's date
                    paidById: direction === 'sent' ? this.user.uid : friendId,
                    receiverId: direction === 'sent' ? friendId : this.user.uid,
                    participants: [this.user.uid, friendId],
                    description: direction === 'sent' ? `Payment to ${friend.name}` : `Payment from ${friend.name}`
                };
                try {
                    await this.firebaseService.addExpense(paymentData); // Reusing addExpense for payments
                    this.ui.showToast('Payment recorded successfully!', 'success');
                } catch (error) {
                    console.error("Error recording payment:", error);
                    this.ui.showToast('Failed to record payment.', 'error');
                }
            });
        }

        async handleSettleUp(form) {
            const formData = new FormData(form);
            const amount = parseFloat(formData.get('amount'));
            const friendId = formData.get('friend');
            const direction = formData.get('paymentDirection');

            if (!friendId) {
                this.ui.showToast('Please select a friend.', 'error');
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                this.ui.showToast('Please enter a valid amount.', 'error');
                return;
            }

            const friendName = this.state.friends.find(f => f.id === friendId)?.name;
            let paidById, receiverId, description;

            if (direction === 'sent') {
                paidById = this.user.uid;
                receiverId = friendId;
                description = `Payment to ${friendName}`;
            } else {
                paidById = friendId;
                receiverId = this.user.uid;
                description = `Payment from ${friendName}`;
            }

            const paymentData = {
                isPayment: true,
                amount,
                date: formData.get('date'),
                paidById,
                receiverId,
                participants: [paidById, receiverId],
                description
            };

            try {
                await this.firebaseService.addExpense(paymentData); // Reusing addExpense for payments
                this.ui.showToast('Payment recorded successfully!', 'success');
                this.ui.closeModal();
            } catch (error) {
                console.error("Error recording payment:", error);
                this.ui.showToast('Failed to record payment.', 'error');
            }
        }

        initMemberInput(container, allAvailableMembers, options = {}) {
            const { preselectedIds = [], inputName = 'members' } = options;

            const selectedMembersContainer = container.querySelector('.selected-members');
            const searchInput = container.querySelector('.member-search-input');
            const dropdown = container.querySelector('.friend-list-dropdown');
            const hiddenMembersContainer = container.parentElement.querySelector('.hidden-members');
            
            // Clear previous state
            selectedMembersContainer.innerHTML = '';
            hiddenMembersContainer.innerHTML = '';

            let availableForSelection = [...allAvailableMembers];

            const dispatchUpdate = () => {
                const customEvent = new CustomEvent('participantsChange', { bubbles: true });
                container.dispatchEvent(customEvent);
            };

            const renderDropdown = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const filteredFriends = availableForSelection.filter(friend => friend.name.toLowerCase().includes(searchTerm));
                dropdown.innerHTML = filteredFriends.map(friend => `
                    <div class="friend-item" data-id="${friend.id}" data-name="${friend.name}">${friend.name}</div>
                `).join('');
                dropdown.style.display = filteredFriends.length > 0 ? 'block' : 'none';
            };

            const addMember = (id, name) => {
                if (hiddenMembersContainer.querySelector(`input[value="${id}"]`)) return;

                const token = document.createElement('div');
                token.className = 'member-token';
                token.innerHTML = `<span>${name}</span><span class="remove-member" data-id="${id}">&times;</span>`;
                selectedMembersContainer.appendChild(token);

                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = inputName;
                hiddenInput.value = id;
                hiddenMembersContainer.appendChild(hiddenInput);

                availableForSelection = availableForSelection.filter(friend => friend.id !== id);
                searchInput.value = '';
                renderDropdown();
                dropdown.style.display = 'none';
                dispatchUpdate();
            };

            const removeMember = (id) => {
                const friend = allAvailableMembers.find(f => f.id === id);
                if (friend) {
                    availableForSelection.push(friend);
                    availableForSelection.sort((a, b) => a.name.localeCompare(b.name));
                }
                
                const token = selectedMembersContainer.querySelector(`.remove-member[data-id="${id}"]`);
                if (token) token.parentElement.remove();
                
                const hiddenInput = hiddenMembersContainer.querySelector(`input[value="${id}"]`);
                if (hiddenInput) hiddenInput.remove();
                
                renderDropdown();
                dispatchUpdate();
            };

            // Pre-select members without dispatching updates for each one
            preselectedIds.forEach(id => {
                const member = allAvailableMembers.find(m => m.id === id);
                if (member && !hiddenMembersContainer.querySelector(`input[value="${id}"]`)) {
                    const token = document.createElement('div');
                    token.className = 'member-token';
                    token.innerHTML = `<span>${member.name}</span><span class="remove-member" data-id="${member.id}">&times;</span>`;
                    selectedMembersContainer.appendChild(token);
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = inputName;
                    hiddenInput.value = member.id;
                    hiddenMembersContainer.appendChild(hiddenInput);
                    availableForSelection = availableForSelection.filter(friend => friend.id !== member.id);
                }
            });
            dispatchUpdate(); // Dispatch once after all pre-selections are done

            // Event listeners
            searchInput.addEventListener('input', renderDropdown);
            searchInput.addEventListener('focus', renderDropdown);

            dropdown.addEventListener('click', e => {
                if (e.target.classList.contains('friend-item')) {
                    addMember(e.target.dataset.id, e.target.dataset.name);
                }
            });

            selectedMembersContainer.addEventListener('click', e => {
                if (e.target.classList.contains('remove-member')) {
                    removeMember(e.target.dataset.id);
                }
            });

            document.addEventListener('click', e => { if (!container.contains(e.target)) { dropdown.style.display = 'none'; } });
        }

        refreshUI() {
             if (this.currentGroup) {
                this.ui.renderGroupDetailPage(this.currentGroup);
             } else {
                this.ui.renderPage(this.currentPage);
                this.ui.updateNav(this.currentPage);
             }
        }
        
        updateParticipants(form, expense = {}) {
            if(!form) return;
            const groupId = form.querySelector('select[name="group"]').value;
            const participantsContainer = form.querySelector('#participants-container');
            if (!participantsContainer) return;
            let availableParticipants = [];

            if (groupId) {
                const group = this.state.groups.find(g => g.id === groupId);
                if (group && group.members) {
                    const friendIdsInGroup = group.members.filter(mId => mId !== this.user.uid);
                    const friendsInGroup = this.state.friends.filter(f => friendIdsInGroup.includes(f.id));
                     availableParticipants = [this.state.user, ...friendsInGroup];
                } else {
                     availableParticipants = [this.state.user, ...this.state.friends];
                }
            } else {
                 availableParticipants = [this.state.user, ...this.state.friends];
            }
            
            participantsContainer.innerHTML = `
                <div class="member-input-container">
                    <div class="selected-members"></div>
                    <input type="text" class="member-search-input" placeholder="Search for participants...">
                    <div class="friend-list-dropdown"></div>
                </div>
                <div class="hidden-members"></div>
            `;

            const memberInputContainer = participantsContainer.querySelector('.member-input-container');
            
            let preselectedIds = [];
            if (expense.id && expense.splits) {
                preselectedIds = expense.splits.map(s => s.friendId);
            } else if (!expense.id) {
                // Default to all available participants for new expenses
                preselectedIds = availableParticipants.map(p => p.id);
            }

            this.initMemberInput(memberInputContainer, availableParticipants, { preselectedIds, inputName: 'participants' });
        }

        updateSplitInputs() {
            const form = document.getElementById('add-expense-form');
            if (!form) return;
            const splitMethod = form.querySelector('input[name="splitMethod"]:checked').value;
            const container = form.querySelector('#split-inputs-container');
            const allUsers = [this.state.user, ...this.state.friends];
            const participants = Array.from(form.querySelectorAll('.hidden-members input'))
                .map(input => {
                    const user = allUsers.find(u => u.id === input.value);
                    return user ? { id: user.id, name: user.name } : null;
                })
                .filter(p => p);

            container.innerHTML = '';
            if (splitMethod === 'equal' || participants.length === 0) {
                this.validateSplits();
                return;
            } 
            
            let inputType = 'number';
            let label = '$';
            if(splitMethod === 'percent') label = '%';
            if(splitMethod === 'shares') label = 'shares';
            
            container.innerHTML = participants.map(p => `
                <div class="flex items-center gap-2">
                    <label class="w-1/2">${p.name}</label>
                    <div class="flex-1 flex items-center">
                        <input type="${inputType}" step="0.01" class="split-input form-input w-full p-1 text-right rounded-md" data-participant-id="${p.id}">
                        <span class="ml-2 w-12 text-left text-gray-500">${label}</span>
                    </div>
                </div>
            `).join('');
            this.validateSplits();
        }

        validateSplits(returnSplits = false) {
            const form = document.getElementById('add-expense-form');
            if (!form) return { isValid: false, message: 'Form not found', splits: [] };

            const amount = parseFloat(form.querySelector('input[name="amount"]').value) || 0;
            const splitMethodRadio = form.querySelector('input[name="splitMethod"]:checked');
            if(!splitMethodRadio) return { isValid: false, message: 'No split method selected', splits: [] };
            
            const splitMethod = splitMethodRadio.value; 
            const participants = Array.from(form.querySelectorAll('.hidden-members input')).map(p => p.value);
            const msgEl = form.querySelector('#split-validation-msg');
            
            if (participants.length === 0) {
                if (msgEl) msgEl.textContent = '';
                return { isValid: true, splits: [] };
            }
            
            let splits = [];
            let total = 0;

            if (splitMethod === 'equal') {
                const splitAmount = amount > 0 && participants.length > 0 ? amount / participants.length : 0;
                splits = participants.map(id => ({ friendId: id, amount: splitAmount }));
                total = amount;
            } else {
                const inputs = form.querySelectorAll('.split-input');
                splits = Array.from(inputs).map(input => {
                    const val = parseFloat(input.value) || 0;
                    total += val;
                    return { friendId: input.dataset.participantId, value: val };
                });
            }

            let message = '';
            let isValid = false;

            switch (splitMethod) {
                case 'equal':
                    isValid = amount > 0;
                    if(!isValid) message = "Amount must be greater than 0.";
                    break;
                case 'exact':
                    isValid = Math.abs(total - amount) < 0.01;
                    if(!isValid) message = `Total must be $${amount.toFixed(2)}. Currently $${total.toFixed(2)}.`;
                    splits = splits.map(s => ({ friendId: s.friendId, amount: s.value }));
                    break;
                case 'percent':
                    isValid = Math.abs(total - 100) < 0.01;
                    if(!isValid) message = `Total must be 100%. Currently ${total}%.`;
                    splits = splits.map(s => ({ friendId: s.friendId, amount: amount * (s.value / 100) }));
                    break;
                case 'shares':
                    isValid = total > 0;
                    if(isValid) {
                        splits = splits.map(s => ({ friendId: s.friendId, amount: amount * (s.value / total) }));
                    } else {
                        message = 'Total shares must be greater than 0.';
                    }
                    break;
            }
            if (msgEl) msgEl.textContent = message;

            if (returnSplits) return { isValid, message, splits };
        }
    }
    
    // --- Authentication Flow --- //
    const authScreen = document.getElementById('auth-screen');
    const appWrapper = document.getElementById('app');
    const googleSignInBtn = document.getElementById('google-signin-btn');
    const loadingSpinner = document.getElementById('loading-spinner');

    auth.onAuthStateChanged(user => {
        if (user) {
            // console.log('Authenticated user:', user.uid);
            // User is signed in.
            authScreen.style.display = 'none';
            appWrapper.style.display = 'flex';
            loadingSpinner.style.display = 'block';
            window.currentApp = new App(user);
        } else {
            // User is signed out.
            authScreen.style.display = 'flex';
            appWrapper.style.display = 'none';
            // Clean up listeners from the previous user's session
            if (window.currentApp) {
                window.currentApp.unsubscribers.forEach(unsub => unsub());
                window.currentApp = null;
            }
        }
    });

    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                console.error("Google sign-in failed:", error);
                alert("Sign-in failed. Please try again. Check the console for more details.");
            });
        });
    }
});
