// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56
};

// ============================
// MINIMAL ABI
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

const MASTERCHEF_ABI = [
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider, signer, userAddress;
let eniacContract, masterchefContract;
let currentPoolId = 1;
let tokenDecimals = 18;

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting ENiAC Staking DApp...');
    
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask!');
        return;
    }
    
    // Setup listeners
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    document.getElementById('approveBtn').addEventListener('click', approveTokens);
    document.getElementById('stakeBtn').addEventListener('click', stakeTokens);
    document.getElementById('unstakeBtn').addEventListener('click', unstakeTokens);
    document.getElementById('claimBtn').addEventListener('click', claimRewards);
    document.getElementById('maxBtn').addEventListener('click', setMaxAmount);
    
    // Check if already connected
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            userAddress = accounts[0];
            await setupApp();
        }
    } catch (error) {
        console.log('No cached connection');
    }
});

// ============================
// CONNECT WALLET
// ============================
async function connectWallet() {
    try {
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        userAddress = accounts[0];
        await setupApp();
        showMessage('Wallet connected!', 'success');
        
    } catch (error) {
        console.error('Connection error:', error);
        showMessage('Connection failed: ' + error.message, 'error');
    }
}

async function setupApp() {
    try {
        // Update UI
        const shortAddr = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        document.getElementById('walletInfo').innerHTML = 
            `<i class="fas fa-wallet"></i> ${shortAddr}`;
        document.getElementById('connectBtn').innerHTML = 
            '<i class="fas fa-check"></i> Connected';
        document.getElementById('connectBtn').classList.add('connected');
        
        // Setup provider and contracts
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Load initial data
        await loadData();
        
        // Setup auto-refresh
        setInterval(loadData, 10000);
        
    } catch (error) {
        console.error('Setup error:', error);
        showMessage('Setup error: ' + error.message, 'error');
    }
}

// ============================
// LOAD DATA
// ============================
async function loadData() {
    if (!userAddress) return;
    
    try {
        // 1. Load wallet balance
        const balance = await eniacContract.balanceOf(userAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        document.getElementById('walletBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4) + ' ENiAC';
        document.getElementById('availableBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4);
        
        // 2. Load allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, 18);
        document.getElementById('allowanceAmount').textContent = 
            parseFloat(allowanceFormatted).toFixed(4) + ' ENiAC';
        
        // Update approve button
        const approveBtn = document.getElementById('approveBtn');
        if (parseFloat(allowanceFormatted) > 0) {
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = '#059669';
            document.getElementById('stakeBtn').disabled = false;
        } else {
            approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
            approveBtn.disabled = false;
            approveBtn.style.background = '#10b981';
            document.getElementById('stakeBtn').disabled = true;
        }
        
        // 3. Try to load staking data from different pools
        await loadStakingData();
        
    } catch (error) {
        console.error('Load data error:', error);
    }
}

async function loadStakingData() {
    // Try pool 1, 0, 2, 3
    const poolIds = [1, 0, 2, 3];
    
    for (const pid of poolIds) {
        try {
            const userInfo = await masterchefContract.userInfo(pid, userAddress);
            const stakedAmount = ethers.utils.formatUnits(userInfo.amount, 18);
            
            // If user has staked in this pool
            if (parseFloat(stakedAmount) > 0) {
                currentPoolId = pid;
                document.getElementById('stakedAmount').textContent = 
                    parseFloat(stakedAmount).toFixed(4) + ' ENiAC';
                
                // Load pending rewards
                const pending = await masterchefContract.pendingANT(pid, userAddress);
                const pendingFormatted = ethers.utils.formatUnits(pending, 18);
                document.getElementById('pendingRewards').textContent = 
                    parseFloat(pendingFormatted).toFixed(4) + ' ENiAC';
                
                // Enable buttons
                document.getElementById('unstakeBtn').disabled = false;
                document.getElementById('claimBtn').disabled = parseFloat(pendingFormatted) <= 0;
                
                console.log(`Found staked amount in pool ${pid}: ${stakedAmount} ENiAC`);
                return;
            }
        } catch (error) {
            continue;
        }
    }
    
    // If no staking found
    document.getElementById('stakedAmount').textContent = '0 ENiAC';
    document.getElementById('pendingRewards').textContent = '0 ENiAC';
    document.getElementById('unstakeBtn').disabled = true;
    document.getElementById('claimBtn').disabled = true;
}

// ============================
// TRANSACTION FUNCTIONS
// ============================
function setMaxAmount() {
    const balanceText = document.getElementById('walletBalance').textContent;
    const balance = parseFloat(balanceText);
    if (!isNaN(balance) && balance > 0) {
        document.getElementById('amountInput').value = balance.toFixed(4);
    }
}

async function approveTokens() {
    try {
        const amountInput = document.getElementById('amountInput').value;
        const amountNum = parseFloat(amountInput);
        
        if (!amountInput || isNaN(amountNum) || amountNum <= 0) {
            showMessage('Please enter a valid amount', 'warning');
            return;
        }
        
        showMessage('Approving tokens...', 'info');
        
        // Convert to string and use parseUnits
        const amountStr = amountNum.toString();
        const amountWei = ethers.utils.parseUnits(amountStr, 18);
        
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, amountWei);
        
        showMessage('Approval submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens approved successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Approve error:', error);
        showMessage('Approve failed: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function stakeTokens() {
    try {
        const amountInput = document.getElementById('amountInput').value;
        const amountNum = parseFloat(amountInput);
        
        if (!amountInput || isNaN(amountNum) || amountNum <= 0) {
            showMessage('Please enter a valid amount', 'warning');
            return;
        }
        
        showMessage('Staking tokens...', 'info');
        
        // Convert to string and use parseUnits
        const amountStr = amountNum.toString();
        const amountWei = ethers.utils.parseUnits(amountStr, 18);
        
        const tx = await masterchefContract.deposit(currentPoolId, amountWei);
        
        showMessage('Stake submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens staked successfully!', 'success');
        document.getElementById('amountInput').value = '';
        await loadData();
        
    } catch (error) {
        console.error('Stake error:', error);
        
        // Try different pool if pool 1 fails
        if (error.message.includes('INVALID_POOL') || 
            error.message.includes('execution reverted') ||
            error.message.includes('Invalid pool')) {
            
            showMessage('Trying pool 0 instead...', 'info');
            
            try {
                const amountInput = document.getElementById('amountInput').value;
                const amountNum = parseFloat(amountInput);
                const amountStr = amountNum.toString();
                const amountWei = ethers.utils.parseUnits(amountStr, 18);
                
                const tx = await masterchefContract.deposit(0, amountWei);
                await tx.wait();
                showMessage('Tokens staked successfully in pool 0!', 'success');
                document.getElementById('amountInput').value = '';
                currentPoolId = 0;
                await loadData();
            } catch (retryError) {
                showMessage('Stake failed in all pools: ' + retryError.message, 'error');
            }
        } else {
            showMessage('Stake failed: ' + error.message, 'error');
        }
    }
}

async function unstakeTokens() {
    try {
        const amountInput = document.getElementById('amountInput').value;
        const amountNum = parseFloat(amountInput);
        
        if (!amountInput || isNaN(amountNum) || amountNum <= 0) {
            showMessage('Please enter a valid amount', 'warning');
            return;
        }
        
        showMessage('Unstaking tokens...', 'info');
        
        // Convert to string and use parseUnits
        const amountStr = amountNum.toString();
        const amountWei = ethers.utils.parseUnits(amountStr, 18);
        
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei);
        
        showMessage('Unstake submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens unstaked successfully!', 'success');
        document.getElementById('amountInput').value = '';
        await loadData();
        
    } catch (error) {
        console.error('Unstake error:', error);
        showMessage('Unstake failed: ' + error.message, 'error');
    }
}

async function claimRewards() {
    try {
        showMessage('Claiming rewards...', 'info');
        
        // Claim rewards by withdrawing 0
        const tx = await masterchefContract.withdraw(currentPoolId, 0);
        
        showMessage('Claim submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Rewards claimed successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Claim error:', error);
        showMessage('Claim failed: ' + error.message, 'error');
    }
}

// ============================
// HELPER FUNCTIONS
// ============================
function showMessage(message, type) {
    const statusEl = document.getElementById('statusMessage');
    
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    statusEl.classList.add(type);
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// ============================
// EVENT LISTENERS
// ============================
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
            userAddress = accounts[0];
            setupApp();
        } else {
            // Disconnected
            location.reload();
        }
    });
    
    window.ethereum.on('chainChanged', () => {
        location.reload();
    });
}

// ============================
// DEBUG FUNCTIONS
// ============================
async function testConnection() {
    const resultEl = document.getElementById('testResult');
    resultEl.innerHTML = 'Testing connection...';
    
    try {
        if (!window.ethereum) {
            resultEl.innerHTML = '❌ MetaMask not installed';
            return;
        }
        
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        resultEl.innerHTML = `✅ Connected to chain ${network.chainId}`;
        
        const eniacContract = new ethers.Contract(
            CONFIG.ENIAC_TOKEN,
            ['function balanceOf(address) view returns (uint256)'],
            provider
        );
        
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            const balance = await eniacContract.balanceOf(accounts[0]);
            resultEl.innerHTML += `<br>💰 Balance: ${ethers.utils.formatUnits(balance, 18)} ENiAC`;
        }
        
    } catch (error) {
        resultEl.innerHTML = `❌ Test failed: ${error.message}`;
    }
}

async function testApprove() {
    const resultEl = document.getElementById('testResult');
    resultEl.innerHTML = 'Testing approve...';
    
    try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        
        const eniacContract = new ethers.Contract(
            CONFIG.ENIAC_TOKEN,
            ['function approve(address,uint256) returns (bool)'],
            signer
        );
        
        const tx = await eniacContract.approve(
            CONFIG.MASTERCHEF,
            ethers.utils.parseUnits('0.01', 18)
        );
        
        resultEl.innerHTML = `✅ Approval sent: ${tx.hash}`;
        
    } catch (error) {
        resultEl.innerHTML = `❌ Approve failed: ${error.message}`;
    }
}

async function testStake() {
    const resultEl = document.getElementById('testResult');
    resultEl.innerHTML = 'Testing stake...';
    
    try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        
        const masterchefContract = new ethers.Contract(
            CONFIG.MASTERCHEF,
            ['function deposit(uint256,uint256)'],
            signer
        );
        
        // Try pool 0 first
        const tx = await masterchefContract.deposit(
            0,
            ethers.utils.parseUnits('0.01', 18)
        );
        
        resultEl.innerHTML = `✅ Stake sent to pool 0: ${tx.hash}`;
        
    } catch (error) {
        resultEl.innerHTML = `❌ Stake failed: ${error.message}`;
    }
}

async function showPoolInfo() {
    const resultEl = document.getElementById('testResult');
    resultEl.innerHTML = 'Checking pools...';
    
    try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        
        const masterchefContract = new ethers.Contract(
            CONFIG.MASTERCHEF,
            ['function userInfo(uint256,address) view returns (uint256,uint256)'],
            provider
        );
        
        const accounts = await provider.listAccounts();
        if (accounts.length === 0) {
            resultEl.innerHTML = '❌ No wallet connected';
            return;
        }
        
        let info = '';
        // Check pools 0-3
        for (let i = 0; i < 4; i++) {
            try {
                const userInfo = await masterchefContract.userInfo(i, accounts[0]);
                const amount = ethers.utils.formatUnits(userInfo.amount, 18);
                info += `Pool ${i}: ${amount} ENiAC<br>`;
            } catch (e) {
                info += `Pool ${i}: Error - ${e.message}<br>`;
            }
        }
        
        resultEl.innerHTML = info;
        
    } catch (error) {
        resultEl.innerHTML = `❌ Pool check failed: ${error.message}`;
    }
}
