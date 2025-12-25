// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56, // BSC Mainnet chain ID
    BSC_RPC: "https://bsc-dataseed.binance.org/",
    BSC_EXPLORER: "https://bscscan.com"
};

// ============================
// CONTRACT ABIs (ĐÃ CẬP NHẬT ĐẦY ĐỦ)
// ============================
const ENIAC_ABI = [
    // ERC20 Functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
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
    "function ANT() view returns (address)",
    "function vault() view returns (address)",
    "function operator() view returns (address)",
    "function startBlock() view returns (uint256)",
    "function ANTPerBlock() view returns (uint256)",
    
    // Utility Functions
    "function updatePool(uint256 _pid)",
    "function massUpdatePools()",
    "function getMultiplier(uint256 _from, uint256 _to) view returns (uint256)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider = null;
let signer = null;
let userAddress = null;
let chainId = null;

let eniacContract = null;
let masterchefContract = null;

let isConnected = false;
let currentPoolId = 0; // Pool ID cần kiểm tra kỹ
let tokenDecimals = 18;
let isDebugMode = true; // Bật debug để xem lỗi chi tiết

// ============================
// DOM ELEMENTS
// ============================
const connectBtn = document.getElementById('connectBtn');
const walletInfo = document.getElementById('walletInfo');
const walletBalance = document.getElementById('walletBalance');
const stakedAmount = document.getElementById('stakedAmount');
const pendingRewards = document.getElementById('pendingRewards');
const allowanceAmount = document.getElementById('allowanceAmount');
const availableBalance = document.getElementById('availableBalance');
const amountInput = document.getElementById('amountInput');
const statusMessage = document.getElementById('statusMessage');

const maxBtn = document.getElementById('maxBtn');
const approveBtn = document.getElementById('approveBtn');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimBtn = document.getElementById('claimBtn');

// Debug panel
const debugDiv = document.createElement('div');
debugDiv.id = 'debugPanel';
debugDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.9);
    color: #0f0;
    padding: 10px;
    border-radius: 5px;
    font-family: monospace;
    font-size: 12px;
    max-width: 500px;
    max-height: 300px;
    overflow: auto;
    z-index: 9999;
    display: ${isDebugMode ? 'block' : 'none'};
    border: 1px solid #0f0;
`;
document.body.appendChild(debugDiv);

function debugLog(message) {
    if (!isDebugMode) return;
    debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
    debugDiv.scrollTop = debugDiv.scrollHeight;
}

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    debugLog('🚀 Initializing ENiAC Staking DApp for BSC...');
    
    try {
        // Check if MetaMask is installed
        if (typeof window.ethereum === 'undefined') {
            showStatus('Please install MetaMask to use this dApp', 'error');
            connectBtn.innerHTML = '<i class="fas fa-download"></i> Install MetaMask';
            connectBtn.onclick = () => window.open('https://metamask.io/download/', '_blank');
            return;
        }
        
        debugLog('✅ MetaMask detected');
        
        // Initialize provider với BSC RPC
        provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Check for cached connection
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            debugLog('🔑 Found cached account');
            userAddress = accounts[0];
            await setupConnection();
        }
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        debugLog(`❌ Initialization error: ${error.message}`);
        showStatus('Initialization error: ' + error.message, 'error');
    }
}

// ============================
// WALLET CONNECTION (BSC)
// ============================
async function handleConnect() {
    if (!window.ethereum) {
        showStatus('Please install MetaMask first', 'error');
        return;
    }
    
    try {
        showStatus('Requesting connection to BSC...', 'info');
        debugLog('🔄 Requesting wallet connection...');
        
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }
        
        userAddress = accounts[0];
        debugLog(`✅ Connected account: ${userAddress}`);
        
        await setupConnection();
        
        showStatus('Wallet connected to BSC successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        debugLog(`❌ Connection error: ${error.message} (code: ${error.code})`);
        
        let errorMsg = 'Connection failed';
        if (error.code === 4001) {
            errorMsg = 'Connection rejected by user';
        }
        
        showStatus(errorMsg, 'error');
        userAddress = null;
        updateUI();
    }
}

async function setupConnection() {
    try {
        debugLog('🔄 Setting up connection...');
        
        // Reinitialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        // Get chain ID
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        debugLog(`🌐 Current chain ID: ${chainId}`);
        
        // Check if we're on BSC Mainnet
        if (chainId !== CONFIG.BSC_CHAIN_ID) {
            showStatus('Please switch to BSC Mainnet', 'warning');
            debugLog('⚠️ Wrong network, requesting switch to BSC...');
            await switchToBSC();
            return;
        }
        
        debugLog('✅ Connected to BSC Mainnet');
        
        // Initialize contracts
        await initializeContracts();
        
        // Update UI
        updateUI();
        
        // Load user data
        await loadUserData();
        
        // Start auto-refresh
        startAutoRefresh();
        
        isConnected = true;
        debugLog('✅ Connection setup completed on BSC');
        
    } catch (error) {
        console.error('❌ Setup error:', error);
        debugLog(`❌ Setup error: ${error.message}`);
        showStatus('Setup error: ' + error.message, 'error');
        isConnected = false;
    }
}

// ============================
// CONTRACT INITIALIZATION
// ============================
async function initializeContracts() {
    try {
        debugLog('🔄 Initializing contracts...');
        
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Get token decimals
        try {
            tokenDecimals = await eniacContract.decimals();
            debugLog(`✅ Token decimals: ${tokenDecimals}`);
        } catch (error) {
            debugLog(`⚠️ Could not get decimals, using default 18: ${error.message}`);
            tokenDecimals = 18;
        }
        
        // Try to find the correct pool
        await findPoolId();
        
        debugLog('✅ Contracts initialized');
        
    } catch (error) {
        console.error('❌ Contract initialization error:', error);
        debugLog(`❌ Contract init error: ${error.message}`);
        throw error;
    }
}

async function findPoolId() {
    try {
        debugLog('🔍 Finding correct pool ID...');
        
        const poolLength = await masterchefContract.poolLength();
        debugLog(`📊 Total pools: ${poolLength}`);
        
        // Try to find pool with ENiAC token
        let foundPool = false;
        for (let i = 0; i < poolLength; i++) {
            try {
                const poolInfo = await masterchefContract.poolInfo(i);
                debugLog(`Pool ${i}: LP Token = ${poolInfo.lpToken}`);
                
                // Check if this is the ENiAC token pool
                if (poolInfo.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                    currentPoolId = i;
                    foundPool = true;
                    debugLog(`✅ Found ENiAC pool at ID: ${currentPoolId}`);
                    
                    // Test userInfo to confirm pool is active
                    try {
                        const testUserInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
                        debugLog(`✅ Pool ${currentPoolId} accessible - User amount: ${ethers.utils.formatUnits(testUserInfo.amount, tokenDecimals)}`);
                    } catch (testError) {
                        debugLog(`⚠️ Pool ${currentPoolId} test failed: ${testError.message}`);
                    }
                    
                    break;
                }
            } catch (e) {
                debugLog(`❌ Error checking pool ${i}: ${e.message}`);
                continue;
            }
        }
        
        if (!foundPool) {
            debugLog('⚠️ ENiAC pool not found in pool list');
            
            // Try common pool IDs
            const commonPoolIds = [0, 1, 2, 3];
            for (const pid of commonPoolIds) {
                try {
                    const testUserInfo = await masterchefContract.userInfo(pid, userAddress);
                    debugLog(`⚠️ Pool ${pid} exists but not ENiAC - User amount: ${ethers.utils.formatUnits(testUserInfo.amount, tokenDecimals)}`);
                    currentPoolId = pid; // Use first accessible pool
                    break;
                } catch (e) {
                    continue;
                }
            }
        }
        
        debugLog(`🎯 Using pool ID: ${currentPoolId}`);
        
    } catch (error) {
        debugLog(`❌ Error finding pool: ${error.message}`);
        currentPoolId = 0; // Default to pool 0
    }
}

// ============================
// STAKE FUNCTION (ĐÃ SỬA LỖI)
// ============================
async function stakeTokens() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const amount = amountInput.value;
    if (!amount || parseFloat(amount) <= 0) {
        showStatus('Please enter a valid amount', 'warning');
        return;
    }
    
    debugLog(`💰 Attempting to stake ${amount} ENiAC...`);
    
    try {
        showStatus('Staking ENiAC tokens on BSC...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        debugLog(`Amount in wei: ${amountWei.toString()}`);
        
        // 1. Check allowance first
        debugLog('🔍 Checking allowance...');
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        debugLog(`Current allowance: ${ethers.utils.formatUnits(allowance, tokenDecimals)} ENiAC`);
        debugLog(`Required allowance: ${amount} ENiAC`);
        
        if (allowance.lt(amountWei)) {
            debugLog('❌ Insufficient allowance');
            showStatus('Please approve tokens first. Click Approve button.', 'warning');
            return;
        }
        
        // 2. Check wallet balance
        debugLog('🔍 Checking wallet balance...');
        const balance = await eniacContract.balanceOf(userAddress);
        debugLog(`Wallet balance: ${ethers.utils.formatUnits(balance, tokenDecimals)} ENiAC`);
        
        if (balance.lt(amountWei)) {
            debugLog('❌ Insufficient balance');
            showStatus('Insufficient balance on BSC', 'error');
            return;
        }
        
        // 3. Check pool accessibility
        debugLog(`🔍 Checking pool ${currentPoolId} accessibility...`);
        try {
            const poolInfo = await masterchefContract.poolInfo(currentPoolId);
            debugLog(`Pool ${currentPoolId} info: ${poolInfo.lpToken}`);
        } catch (poolError) {
            debugLog(`❌ Pool ${currentPoolId} error: ${poolError.message}`);
            showStatus('Invalid pool. Please refresh the page.', 'error');
            return;
        }
        
        // 4. Prepare transaction
        debugLog('📝 Preparing stake transaction...');
        
        // Disable button during transaction
        stakeBtn.disabled = true;
        stakeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Staking...';
        
        // Estimate gas
        debugLog('⛽ Estimating gas...');
        let gasEstimate;
        try {
            gasEstimate = await masterchefContract.estimateGas.deposit(currentPoolId, amountWei);
            debugLog(`Estimated gas: ${gasEstimate.toString()}`);
        } catch (gasError) {
            debugLog(`⚠️ Gas estimation failed: ${gasError.message}`);
            // Continue anyway with default gas
        }
        
        // Send deposit transaction
        debugLog('🚀 Sending transaction...');
        const tx = await masterchefContract.deposit(currentPoolId, amountWei, {
            gasLimit: gasEstimate ? gasEstimate.mul(120).div(100) : 300000, // 20% buffer
            gasPrice: await provider.getGasPrice()
        });
        
        debugLog(`📫 Transaction sent: ${tx.hash}`);
        showStatus('Transaction submitted to BSC. Waiting for confirmation...', 'info');
        
        // Show transaction link
        const txLink = `${CONFIG.BSC_EXPLORER}/tx/${tx.hash}`;
        showStatus(`<a href="${txLink}" target="_blank" style="color: white; text-decoration: underline;">View transaction on BscScan</a>`, 'info');
        
        const receipt = await tx.wait();
        debugLog(`📦 Transaction confirmed in block: ${receipt.blockNumber}`);
        
        if (receipt.status === 1) {
            debugLog('✅ Stake successful!');
            showStatus(`Successfully staked ${amount} ENiAC on BSC!`, 'success');
            
            // Clear input and reload data
            amountInput.value = '';
            await loadUserData();
            
        } else {
            debugLog('❌ Transaction failed (status 0)');
            throw new Error('Transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Stake error on BSC:', error);
        debugLog(`❌ Stake error: ${error.message}`);
        debugLog(`❌ Error code: ${error.code}`);
        debugLog(`❌ Error data: ${error.data}`);
        
        let errorMsg = 'Stake failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.code === -32603) {
            errorMsg = 'Internal JSON-RPC error';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('User denied transaction')) {
            errorMsg = 'User denied transaction on BSC';
        } else if (error.message.includes('execution reverted')) {
            // Try to decode the revert reason
            try {
                const revertReason = error.message.match(/execution reverted: (.*)/);
                if (revertReason) {
                    errorMsg = `Contract error: ${revertReason[1]}`;
                } else {
                    errorMsg = 'Contract execution reverted';
                }
            } catch (e) {
                errorMsg = 'Contract execution error';
            }
        } else if (error.message.includes('INSUFFICIENT_LIQUIDITY')) {
            errorMsg = 'Insufficient liquidity in pool';
        } else if (error.message.includes('INVALID_POOL')) {
            errorMsg = 'Invalid pool ID. Please refresh page.';
        }
        
        showStatus(errorMsg, 'error');
        
        // Thêm nút để thử pool khác
        if (error.message.includes('INVALID_POOL') || error.message.includes('execution reverted')) {
            const tryPoolBtn = document.createElement('button');
            tryPoolBtn.innerHTML = '<i class="fas fa-redo"></i> Try Different Pool';
            tryPoolBtn.style.cssText = `
                margin-top: 10px;
                background: #3b82f6;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.9rem;
                display: block;
                width: 100%;
            `;
            tryPoolBtn.onclick = async () => {
                tryPoolBtn.disabled = true;
                debugLog('🔄 Trying different pool...');
                await findPoolId();
                await loadUserData();
                showStatus('Tried different pool. Please try staking again.', 'info');
                setTimeout(() => tryPoolBtn.remove(), 3000);
            };
            
            const statusEl = document.getElementById('statusMessage');
            statusEl.appendChild(tryPoolBtn);
        }
        
    } finally {
        // Reset stake button
        stakeBtn.disabled = false;
        stakeBtn.innerHTML = '<i class="fas fa-lock"></i> Stake';
    }
}

// ============================
// APPROVE FUNCTION (CẬP NHẬT)
// ============================
async function approveTokens() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const amount = amountInput.value;
    if (!amount || parseFloat(amount) <= 0) {
        showStatus('Please enter a valid amount', 'warning');
        return;
    }
    
    debugLog(`✅ Attempting to approve ${amount} ENiAC...`);
    
    try {
        showStatus('Approving ENiAC tokens on BSC...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Disable button during transaction
        approveBtn.disabled = true;
        approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving...';
        
        // Send approval transaction với unlimited approval (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
        // Hoặc có thể dùng số lớn thay vì unlimited
        const unlimitedApproval = ethers.constants.MaxUint256;
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, unlimitedApproval);
        
        showStatus('Approval transaction submitted. Waiting for confirmation...', 'info');
        debugLog(`📫 Approval tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus('ENiAC tokens approved successfully on BSC!', 'success');
            debugLog('✅ Approval successful!');
            
            // Update approve button
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = '#059669';
            
            // Enable stake button
            stakeBtn.disabled = false;
            
            // Reload allowance data
            await loadUserData();
            
        } else {
            throw new Error('Approval transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Approval error on BSC:', error);
        debugLog(`❌ Approval error: ${error.message}`);
        
        let errorMsg = 'Approval failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract approval failed';
        }
        
        showStatus(errorMsg, 'error');
        
        // Reset approve button
        approveBtn.disabled = false;
        approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
        approveBtn.style.background = '#10b981';
    }
}

// ============================
// DATA LOADING FUNCTIONS
// ============================
async function loadUserData() {
    if (!userAddress || !eniacContract || !masterchefContract) {
        return;
    }
    
    debugLog('📊 Loading user data...');
    
    try {
        // Load wallet balance
        const balance = await eniacContract.balanceOf(userAddress);
        const formattedBalance = ethers.utils.formatUnits(balance, tokenDecimals);
        walletBalance.textContent = `${parseFloat(formattedBalance).toFixed(4)} ENiAC`;
        availableBalance.textContent = parseFloat(formattedBalance).toFixed(4);
        
        // Load staking data
        await loadStakingData();
        
        // Update approve button
        await updateApproveButton();
        
        debugLog('✅ User data loaded');
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        debugLog(`❌ Load data error: ${error.message}`);
        showStatus('Error loading data: ' + error.message, 'error');
    }
}

async function loadStakingData() {
    try {
        debugLog(`📊 Loading staking data for pool ${currentPoolId}...`);
        
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        const staked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
        stakedAmount.textContent = `${parseFloat(staked).toFixed(4)} ENiAC`;
        debugLog(`Staked amount: ${staked} ENiAC`);
        
        // Load pending rewards
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingFormatted = ethers.utils.formatUnits(pending, tokenDecimals);
        pendingRewards.textContent = `${parseFloat(pendingFormatted).toFixed(4)} ENiAC`;
        debugLog(`Pending rewards: ${pendingFormatted} ENiAC`);
        
        // Enable/disable buttons based on staked amount
        if (parseFloat(staked) > 0) {
            unstakeBtn.disabled = false;
            claimBtn.disabled = parseFloat(pendingFormatted) <= 0;
        } else {
            unstakeBtn.disabled = true;
            claimBtn.disabled = true;
        }
        
    } catch (error) {
        debugLog(`❌ Error loading staking data: ${error.message}`);
        stakedAmount.textContent = '0 ENiAC';
        pendingRewards.textContent = '0 ENiAC';
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
    }
}

// ============================
// HELPER FUNCTIONS
// ============================
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    
    statusEl.innerHTML = ''; // Clear previous content
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    statusEl.appendChild(messageDiv);
    
    statusEl.className = 'status-message';
    statusEl.classList.add(type);
    statusEl.style.display = 'block';
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 8000);
}

// ============================
// SETUP EVENT LISTENERS
// ============================
function setupEventListeners() {
    // Connect button
    connectBtn.addEventListener('click', handleConnect);
    
    // Transaction buttons
    maxBtn.addEventListener('click', setMaxAmount);
    approveBtn.addEventListener('click', approveTokens);
    stakeBtn.addEventListener('click', stakeTokens);
    unstakeBtn.addEventListener('click', unstakeTokens);
    claimBtn.addEventListener('click', claimRewards);
    
    // Input validation
    amountInput.addEventListener('input', validateAmount);
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('disconnect', handleDisconnect);
    }
}

function validateAmount() {
    const value = parseFloat(amountInput.value);
    if (isNaN(value) || value < 0) {
        amountInput.value = '';
    }
}

// ============================
// TEST FUNCTIONS (DEBUG)
// ============================
async function testStakeConnection() {
    debugLog('🧪 Testing stake connection...');
    
    try {
        // Test 1: Check contract connection
        const tokenName = await eniacContract.name();
        const tokenSymbol = await eniacContract.symbol();
        debugLog(`Token: ${tokenName} (${tokenSymbol})`);
        
        // Test 2: Check MasterChef connection
        const chefANT = await masterchefContract.ANT();
        debugLog(`MasterChef ANT: ${chefANT}`);
        
        // Test 3: Check pool info
        const poolInfo = await masterchefContract.poolInfo(currentPoolId);
        debugLog(`Pool ${currentPoolId} LP Token: ${poolInfo.lpToken}`);
        
        // Test 4: Test deposit function (estimate gas only)
        const testAmount = ethers.utils.parseUnits("0.0001", tokenDecimals);
        const gasEstimate = await masterchefContract.estimateGas.deposit(currentPoolId, testAmount);
        debugLog(`Deposit gas estimate: ${gasEstimate.toString()}`);
        
        debugLog('✅ All tests passed!');
        return true;
        
    } catch (error) {
        debugLog(`❌ Test failed: ${error.message}`);
        return false;
    }
}

// Thêm nút test vào UI
const testBtn = document.createElement('button');
testBtn.innerHTML = '<i class="fas fa-vial"></i> Test Connection';
testBtn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: #8b5cf6;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 999;
    font-size: 12px;
`;
testBtn.onclick = testStakeConnection;
if (isDebugMode) {
    document.body.appendChild(testBtn);
}

// ============================
// INITIALIZE ON LOAD
// ============================
window.addEventListener('load', () => {
    debugLog('ENiAC Staking DApp loaded for BSC');
    showStatus('Ready to connect to BSC Mainnet', 'info');
    
    // Thêm hướng dẫn debug
    if (isDebugMode) {
        debugLog('Debug mode enabled. Check console for details.');
        debugLog(`ENiAC Token: ${CONFIG.ENIAC_TOKEN}`);
        debugLog(`MasterChef: ${CONFIG.MASTERCHEF}`);
    }
});
