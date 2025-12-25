// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56
};

// ============================
// MINIMAL ABI (UPDATED)
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function totalSupply() view returns (uint256)"
];

const MASTERCHEF_ABI = [
    // Core Functions
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    
    // Info Functions
    "function poolLength() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)",
    
    // Token Functions
    "function ANT() view returns (address)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider, signer, userAddress;
let eniacContract, masterchefContract;
let currentPoolId = null; // Will find automatically
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
        
        // Find the correct pool ID
        await findCorrectPool();
        
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
// FIND CORRECT POOL
// ============================
async function findCorrectPool() {
    try {
        // Get the ANT token address from MasterChef
        const antAddress = await masterchefContract.ANT();
        console.log('ANT token address from MasterChef:', antAddress);
        
        // Get pool length
        const poolLength = await masterchefContract.poolLength();
        console.log('Total pools:', poolLength.toString());
        
        // Search for pool containing ENiAC token
        for (let i = 0; i < poolLength; i++) {
            try {
                const poolInfo = await masterchefContract.poolInfo(i);
                console.log(`Pool ${i}: LP Token = ${poolInfo.lpToken}`);
                
                // Check if this pool contains ENiAC token
                if (poolInfo.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                    currentPoolId = i;
                    console.log(`✅ Found ENiAC pool at ID: ${currentPoolId}`);
                    return;
                }
            } catch (e) {
                console.log(`Error checking pool ${i}:`, e.message);
                continue;
            }
        }
        
        // If not found, check if ANT token matches ENiAC
        if (antAddress.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
            console.log('✅ ANT token is ENiAC token');
            // Usually pool 0 is the main ANT token pool
            currentPoolId = 0;
        } else {
            console.log('❌ ENiAC pool not found. Using pool 0 as default.');
            currentPoolId = 0;
        }
        
    } catch (error) {
        console.error('Error finding pool:', error);
        currentPoolId = 0; // Default to pool 0
    }
}

// ============================
// LOAD DATA
// ============================
async function loadData() {
    if (!userAddress || currentPoolId === null) return;
    
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
        
        // 3. Load staking data
        await loadStakingData();
        
    } catch (error) {
        console.error('Load data error:', error);
    }
}

async function loadStakingData() {
    try {
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        const stakedAmount = ethers.utils.formatUnits(userInfo.amount, 18);
        
        document.getElementById('stakedAmount').textContent = 
            parseFloat(stakedAmount).toFixed(4) + ' ENiAC';
        
        // Load pending rewards
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingFormatted = ethers.utils.formatUnits(pending, 18);
        document.getElementById('pendingRewards').textContent = 
            parseFloat(pendingFormatted).toFixed(4) + ' ENiAC';
        
        // Enable/disable buttons
        document.getElementById('unstakeBtn').disabled = parseFloat(stakedAmount) <= 0;
        document.getElementById('claimBtn').disabled = parseFloat(pendingFormatted) <= 0;
        
        console.log(`Staked: ${stakedAmount} ENiAC, Pending: ${pendingFormatted} ENiAC`);
        
    } catch (error) {
        console.error('Load staking data error:', error);
        document.getElementById('stakedAmount').textContent = '0 ENiAC';
        document.getElementById('pendingRewards').textContent = '0 ENiAC';
        document.getElementById('unstakeBtn').disabled = true;
        document.getElementById('claimBtn').disabled = true;
    }
}

// ============================
// TRANSACTION FUNCTIONS (FIXED)
// ============================
function setMaxAmount() {
    const balanceText = document.getElementById('walletBalance').textContent;
    const balance = parseFloat(balanceText);
    if (!isNaN(balance) && balance > 0) {
        // Leave a little for gas (optional)
        const maxAmount = Math.max(0, balance - 0.001);
        document.getElementById('amountInput').value = maxAmount.toFixed(4);
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
        
        // Check balance first
        const balance = await eniacContract.balanceOf(userAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        
        if (amountNum > parseFloat(balanceFormatted)) {
            showMessage(`Insufficient balance. You have ${parseFloat(balanceFormatted).toFixed(4)} ENiAC`, 'error');
            return;
        }
        
        showMessage('Approving tokens...', 'info');
        
        // Use MaxUint256 for unlimited approval
        const maxApproval = ethers.constants.MaxUint256;
        
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, maxApproval);
        
        showMessage('Approval submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens approved successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Approve error:', error);
        showMessage('Approve failed: ' + getErrorMessage(error), 'error');
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
        
        // Check balance
        const balance = await eniacContract.balanceOf(userAddress);
        const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, 18));
        
        if (amountNum > balanceFormatted) {
            showMessage(`Insufficient balance. You have ${balanceFormatted.toFixed(4)} ENiAC`, 'error');
            return;
        }
        
        // Check allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = parseFloat(ethers.utils.formatUnits(allowance, 18));
        
        if (amountNum > allowanceFormatted) {
            showMessage('Insufficient allowance. Please approve first.', 'error');
            return;
        }
        
        showMessage('Staking tokens...', 'info');
        
        // Convert to wei
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        
        // Estimate gas
        let gasEstimate;
        try {
            gasEstimate = await masterchefContract.estimateGas.deposit(currentPoolId, amountWei);
            console.log('Gas estimate:', gasEstimate.toString());
        } catch (gasError) {
            console.log('Gas estimation failed:', gasError.message);
            // Use default gas limit
            gasEstimate = ethers.BigNumber.from(300000);
        }
        
        // Send transaction with proper gas settings
        const tx = await masterchefContract.deposit(currentPoolId, amountWei, {
            gasLimit: gasEstimate.mul(120).div(100) // 20% buffer
        });
        
        showMessage('Stake submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens staked successfully!', 'success');
        document.getElementById('amountInput').value = '';
        await loadData();
        
    } catch (error) {
        console.error('Stake error:', error);
        
        const errorMsg = getErrorMessage(error);
        
        // Try pool 0 if current pool fails
        if (error.message.includes('Invalid pool') || 
            error.message.includes('execution reverted')) {
            
            showMessage('Trying pool 0 instead...', 'info');
            
            try {
                const amountInput = document.getElementById('amountInput').value;
                const amountNum = parseFloat(amountInput);
                const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
                
                const tx = await masterchefContract.deposit(0, amountWei);
                await tx.wait();
                showMessage('Tokens staked successfully in pool 0!', 'success');
                document.getElementById('amountInput').value = '';
                currentPoolId = 0;
                await loadData();
            } catch (retryError) {
                showMessage('Stake failed: ' + getErrorMessage(retryError), 'error');
            }
        } else {
            showMessage('Stake failed: ' + errorMsg, 'error');
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
        
        // Check staked amount
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        const stakedAmount = parseFloat(ethers.utils.formatUnits(userInfo.amount, 18));
        
        if (amountNum > stakedAmount) {
            showMessage(`Insufficient staked amount. You have ${stakedAmount.toFixed(4)} ENiAC staked`, 'error');
            return;
        }
        
        showMessage('Unstaking tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei);
        
        showMessage('Unstake submitted. Waiting...', 'info');
        await tx.wait();
        
        showMessage('Tokens unstaked successfully!', 'success');
        document.getElementById('amountInput').value = '';
        await loadData();
        
    } catch (error) {
        console.error('Unstake error:', error);
        showMessage('Unstake failed: ' + getErrorMessage(error), 'error');
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
        showMessage('Claim failed: ' + getErrorMessage(error), 'error');
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

function getErrorMessage(error) {
    if (error.code === 4001) {
        return 'Transaction rejected by user';
    }
    
    if (error.message.includes('insufficient funds')) {
        return 'Insufficient BNB for gas fees';
    }
    
    if (error.message.includes('transfer amount exceeds balance')) {
        return 'Insufficient token balance';
    }
    
    if (error.message.includes('execution reverted')) {
        // Try to extract revert reason
        const match = error.message.match(/execution reverted: (.*)/);
        if (match) {
            return `Contract error: ${match[1]}`;
        }
        return 'Contract execution reverted';
    }
    
    if (error.message.includes('INVALID_ARGUMENT')) {
        return 'Invalid input amount';
    }
    
    return error.message || 'Unknown error';
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
        
        if (network.chainId !== CONFIG.BSC_CHAIN_ID) {
            resultEl.innerHTML += `<br>⚠️ Please switch to BSC Mainnet (Chain ID: ${CONFIG.BSC_CHAIN_ID})`;
        }
        
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
            ethers.constants.MaxUint256
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
        
        // Try with a very small amount
        const tx = await masterchefContract.deposit(
            0,
            ethers.utils.parseUnits('0.001', 18)
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
