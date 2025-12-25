// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    
    // RPC Endpoints (Fallback)
    RPC_URLS: {
        1: "https://eth.llamarpc.com", // Ethereum Mainnet
        5: "https://rpc.ankr.com/eth_goerli", // Goerli
        11155111: "https://rpc.sepolia.org" // Sepolia
    }
};

// ============================
// CONTRACT ABIs (Minimal)
// ============================
const ENIAC_ABI = [
    // Basic ERC20
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

const MASTERCHEF_ABI = [
    // Core functions
    "function poolLength() view returns (uint256)",
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)"
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
let currentPoolId = 1; // Default to pool 1 for ENiAC single stake
let tokenDecimals = 18;

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

const approveBtn = document.getElementById('approveBtn');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimBtn = document.getElementById('claimBtn');

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('🚀 Initializing ENiAC Staking DApp...');
    
    try {
        // Check if MetaMask is installed
        if (typeof window.ethereum === 'undefined') {
            showStatus('Please install MetaMask to use this dApp', 'error');
            connectBtn.innerHTML = '<i class="fas fa-download"></i> Install MetaMask';
            connectBtn.onclick = () => window.open('https://metamask.io/download/', '_blank');
            return;
        }
        
        console.log('✅ MetaMask detected');
        
        // Initialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        
        // Get initial chain ID
        try {
            const network = await provider.getNetwork();
            chainId = network.chainId;
            console.log('🌐 Initial chain ID:', chainId);
        } catch (error) {
            console.warn('Could not get initial chain ID:', error);
        }
        
        // Check for cached connection
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            console.log('🔑 Found cached account');
            userAddress = accounts[0];
            await setupConnection();
        }
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showStatus('Initialization error: ' + error.message, 'error');
    }
}

function setupEventListeners() {
    // Connect button
    connectBtn.addEventListener('click', handleConnect);
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('disconnect', handleDisconnect);
    }
}

// ============================
// WALLET CONNECTION
// ============================
async function handleConnect() {
    if (!window.ethereum) {
        showStatus('Please install MetaMask first', 'error');
        return;
    }
    
    try {
        showStatus('Requesting connection...', 'info');
        
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }
        
        userAddress = accounts[0];
        console.log('✅ Connected account:', userAddress);
        
        await setupConnection();
        
        showStatus('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        
        let errorMsg = 'Connection failed';
        if (error.code === 4001) {
            errorMsg = 'Connection rejected by user';
        } else if (error.message.includes('User rejected')) {
            errorMsg = 'Connection rejected';
        } else {
            errorMsg = error.message;
        }
        
        showStatus(errorMsg, 'error');
        userAddress = null;
        updateUI();
    }
}

async function setupConnection() {
    try {
        // Reinitialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        signer = provider.getSigner();
        
        // Get chain ID
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        // Initialize contracts
        await initializeContracts();
        
        // Update UI
        updateUI();
        
        // Load user data
        await loadUserData();
        
        isConnected = true;
        console.log('✅ Connection setup completed');
        
    } catch (error) {
        console.error('❌ Setup error:', error);
        showStatus('Setup error: ' + error.message, 'error');
        isConnected = false;
    }
}

async function initializeContracts() {
    try {
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Get token decimals
        try {
            tokenDecimals = await eniacContract.decimals();
            console.log('✅ Token decimals:', tokenDecimals);
        } catch (error) {
            console.warn('⚠️ Could not get decimals, using default 18');
            tokenDecimals = 18;
        }
        
        console.log('✅ Contracts initialized');
        
    } catch (error) {
        console.error('❌ Contract initialization error:', error);
        throw error;
    }
}

// ============================
// EVENT HANDLERS
// ============================
async function handleAccountsChanged(accounts) {
    console.log('🔄 Accounts changed:', accounts);
    
    if (!accounts || accounts.length === 0) {
        // Disconnected
        userAddress = null;
        isConnected = false;
        showStatus('Wallet disconnected', 'warning');
    } else {
        // Account changed
        userAddress = accounts[0];
        console.log('🔄 New account:', userAddress);
        await setupConnection();
        showStatus('Account changed', 'info');
    }
    
    updateUI();
}

function handleChainChanged(newChainId) {
    console.log('🔗 Chain changed to:', newChainId);
    
    // Convert hex to decimal if needed
    if (typeof newChainId === 'string' && newChainId.startsWith('0x')) {
        chainId = parseInt(newChainId, 16);
    } else {
        chainId = newChainId;
    }
    
    // Reload page to reset everything
    showStatus('Network changed, reloading...', 'info');
    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

function handleDisconnect(error) {
    console.log('🔌 Disconnected:', error);
    userAddress = null;
    isConnected = false;
    updateUI();
    showStatus('Wallet disconnected', 'warning');
}

// ============================
// UI UPDATES
// ============================
function updateUI() {
    if (userAddress) {
        // Update wallet info
        const shortAddress = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> <span>${shortAddress}</span>`;
        walletInfo.title = userAddress;
        
        // Update connect button
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
        
        // Enable buttons
        approveBtn.disabled = false;
        stakeBtn.disabled = false;
        unstakeBtn.disabled = false;
        claimBtn.disabled = false;
        amountInput.disabled = false;
        
    } else {
        // Reset wallet info
        walletInfo.innerHTML = '<i class="fas fa-wallet"></i> <span>Not Connected</span>';
        
        // Reset connect button
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect Wallet';
        connectBtn.classList.remove('connected');
        
        // Disable buttons
        approveBtn.disabled = true;
        stakeBtn.disabled = true;
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
        amountInput.disabled = true;
        
        // Clear data
        clearData();
    }
}

function clearData() {
    walletBalance.textContent = '0 ENiAC';
    stakedAmount.textContent = '0 ENiAC';
    pendingRewards.textContent = '0 ENiAC';
    allowanceAmount.textContent = '0 ENiAC';
    availableBalance.textContent = '0';
    amountInput.value = '';
}

// ============================
// DATA LOADING
// ============================
async function loadUserData() {
    if (!userAddress || !eniacContract || !masterchefContract) {
        return;
    }
    
    console.log('📊 Loading user data...');
    
    try {
        // Load wallet balance
        const balance = await eniacContract.balanceOf(userAddress);
        const formattedBalance = ethers.utils.formatUnits(balance, tokenDecimals);
        walletBalance.textContent = `${parseFloat(formattedBalance).toFixed(4)} ENiAC`;
        availableBalance.textContent = parseFloat(formattedBalance).toFixed(4);
        
        // Try to load staking data
        try {
            // Try pool 1 first (ENiAC single stake)
            const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
            const staked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
            stakedAmount.textContent = `${parseFloat(staked).toFixed(4)} ENiAC`;
            
            // Load pending rewards
            const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
            const pendingFormatted = ethers.utils.formatUnits(pending, tokenDecimals);
            pendingRewards.textContent = `${parseFloat(pendingFormatted).toFixed(4)} ENiAC`;
            
        } catch (poolError) {
            console.log('⚠️ Pool 1 not found, trying pool 0...');
            try {
                currentPoolId = 0;
                const userInfo = await masterchefContract.userInfo(0, userAddress);
                const staked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
                stakedAmount.textContent = `${parseFloat(staked).toFixed(4)} ENiAC`;
                
                const pending = await masterchefContract.pendingANT(0, userAddress);
                const pendingFormatted = ethers.utils.formatUnits(pending, tokenDecimals);
                pendingRewards.textContent = `${parseFloat(pendingFormatted).toFixed(4)} ENiAC`;
                
            } catch (error) {
                console.log('❌ Could not load any pool data:', error);
                stakedAmount.textContent = '0 ENiAC';
                pendingRewards.textContent = '0 ENiAC';
            }
        }
        
        // Check allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, tokenDecimals);
        allowanceAmount.textContent = `${parseFloat(allowanceFormatted).toFixed(4)} ENiAC`;
        
        // Update approve button based on allowance
        if (parseFloat(allowanceFormatted) > 0) {
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else {
            approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
            approveBtn.disabled = false;
            approveBtn.style.background = '';
        }
        
        console.log('✅ User data loaded');
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showStatus('Error loading data: ' + error.message, 'error');
    }
}

// ============================
// TRANSACTION FUNCTIONS
// ============================
function setMaxAmount() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const balanceText = walletBalance.textContent;
    const balance = parseFloat(balanceText);
    
    if (!isNaN(balance) && balance > 0) {
        amountInput.value = balance.toFixed(4);
    }
}

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
    
    try {
        showStatus('Approving ENiAC tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Estimate gas first
        let gasLimit;
        try {
            const gasEstimate = await eniacContract.estimateGas.approve(CONFIG.MASTERCHEF, amountWei);
            gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
            console.log('⛽ Gas estimate:', gasEstimate.toString());
        } catch (gasError) {
            console.warn('⚠️ Could not estimate gas, using default');
            gasLimit = 100000;
        }
        
        // Send approval transaction
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, amountWei, {
            gasLimit: gasLimit
        });
        
        showStatus('Transaction submitted. Waiting for confirmation...', 'info');
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus('ENiAC tokens approved successfully!', 'success');
            
            // Update approve button
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            
            // Reload allowance data
            await loadUserData();
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Approval error:', error);
        
        let errorMsg = 'Approval failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient ETH for gas fees';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showStatus(errorMsg, 'error');
    }
}

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
    
    try {
        showStatus('Staking ENiAC tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Check allowance first
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        if (allowance.lt(amountWei)) {
            showStatus('Please approve tokens first', 'warning');
            return;
        }
        
        // Estimate gas for deposit
        let gasLimit;
        try {
            const gasEstimate = await masterchefContract.estimateGas.deposit(currentPoolId, amountWei);
            gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
            console.log('⛽ Deposit gas estimate:', gasEstimate.toString());
        } catch (gasError) {
            console.warn('⚠️ Could not estimate gas, using default');
            gasLimit = 200000;
        }
        
        // Send deposit transaction
        const tx = await masterchefContract.deposit(currentPoolId, amountWei, {
            gasLimit: gasLimit
        });
        
        showStatus('Transaction submitted. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully staked ${amount} ENiAC!`, 'success');
            
            // Clear input and reload data
            amountInput.value = '';
            await loadUserData();
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Stake error:', error);
        
        let errorMsg = 'Stake failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient ETH for gas fees';
        } else if (error.message.includes('allowance')) {
            errorMsg = 'Insufficient allowance. Please approve more tokens.';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showStatus(errorMsg, 'error');
    }
}

async function unstakeTokens() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const amount = amountInput.value;
    if (!amount || parseFloat(amount) <= 0) {
        showStatus('Please enter a valid amount', 'warning');
        return;
    }
    
    try {
        showStatus('Unstaking ENiAC tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Estimate gas for withdraw
        let gasLimit;
        try {
            const gasEstimate = await masterchefContract.estimateGas.withdraw(currentPoolId, amountWei);
            gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
            console.log('⛽ Withdraw gas estimate:', gasEstimate.toString());
        } catch (gasError) {
            console.warn('⚠️ Could not estimate gas, using default');
            gasLimit = 200000;
        }
        
        // Send withdraw transaction
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei, {
            gasLimit: gasLimit
        });
        
        showStatus('Transaction submitted. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully unstaked ${amount} ENiAC!`, 'success');
            
            // Clear input and reload data
            amountInput.value = '';
            await loadUserData();
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Unstake error:', error);
        
        let errorMsg = 'Unstake failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient ETH for gas fees';
        } else if (error.message.includes('withdraw: not good')) {
            errorMsg = 'Insufficient staked amount';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showStatus(errorMsg, 'error');
    }
}

async function claimRewards() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    try {
        showStatus('Claiming rewards...', 'info');
        
        // Check pending rewards first
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingAmount = ethers.utils.formatUnits(pending, tokenDecimals);
        
        if (parseFloat(pendingAmount) <= 0) {
            showStatus('No rewards to claim', 'warning');
            return;
        }
        
        // Estimate gas for claim (withdraw 0)
        let gasLimit;
        try {
            const gasEstimate = await masterchefContract.estimateGas.withdraw(currentPoolId, 0);
            gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
            console.log('⛽ Claim gas estimate:', gasEstimate.toString());
        } catch (gasError) {
            console.warn('⚠️ Could not estimate gas, using default');
            gasLimit = 150000;
        }
        
        // Send claim transaction (withdraw 0)
        const tx = await masterchefContract.withdraw(currentPoolId, 0, {
            gasLimit: gasLimit
        });
        
        showStatus('Transaction submitted. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully claimed ${parseFloat(pendingAmount).toFixed(4)} ENiAC!`, 'success');
            
            // Reload data
            await loadUserData();
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Claim error:', error);
        
        let errorMsg = 'Claim failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient ETH for gas fees';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showStatus(errorMsg, 'error');
    }
}

// ============================
// HELPER FUNCTIONS
// ============================
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + type;
    statusMessage.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

// ============================
// INITIAL LOG
// ============================
console.log('✅ ENiAC Staking DApp initialized successfully');
