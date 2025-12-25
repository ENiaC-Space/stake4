// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    VAULT: "0x1d30e4a1357C6e9ee2a983348aFDb558A1BD2976",
    
    // RPC Endpoint (Fallback)
    RPC_URL: "https://eth.llamarpc.com",
    
    // Chain IDs
    MAINNET: 1,
    GOERLI: 5,
    SEPOLIA: 11155111
};

// ============================
// SIMPLIFIED CONTRACT ABIs
// ============================
const ENIAC_ABI = [
    // Basic ERC20
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address recipient, uint256 amount) returns (bool)",
    
    // Staking related
    "function mint(address _to, uint256 _amount)"
];

const MASTERCHEF_ABI = [
    // Core functions
    "function poolLength() view returns (uint256)",
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    
    // Info functions
    "function ANT() view returns (address)",
    "function ANTPerBlock() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)",
    "function BONUS_MULTIPLIER() view returns (uint256)",
    "function startBlock() view returns (uint256)"
];

// ============================
// GLOBAL STATE
// ============================
let provider = null;
let signer = null;
let userAddress = null;
let chainId = null;

let eniacContract = null;
let masterchefContract = null;

let isInitialized = false;
let isConnecting = false;
let currentPoolId = null;
let tokenDecimals = 18;

// ============================
// DOM ELEMENTS
// ============================
const loadingOverlay = document.getElementById('loadingOverlay');
const connectBtn = document.getElementById('connectBtn');
const connectBtnText = document.getElementById('connectBtnText');
const networkBadge = document.getElementById('networkBadge');
const walletAddress = document.getElementById('walletAddress');
const networkStatus = document.getElementById('networkStatus');
const walletStatus = document.getElementById('walletStatus');
const networkWarning = document.getElementById('networkWarning');
const connectionStatus = document.getElementById('connectionStatus');
const chainIdElement = document.getElementById('chainId');

// Balance elements
const walletBalance = document.getElementById('walletBalance');
const stakedAmount = document.getElementById('stakedAmount');
const pendingRewards = document.getElementById('pendingRewards');
const allowanceAmount = document.getElementById('allowanceAmount');
const availableBalance = document.getElementById('availableBalance');

// Form elements
const stakeAmount = document.getElementById('stakeAmount');
const maxBtn = document.getElementById('maxBtn');
const halfBtn = document.getElementById('halfBtn');
const infoText = document.getElementById('infoText');

// Button elements
const approveBtn = document.getElementById('approveBtn');
const approveBtnText = document.getElementById('approveBtnText');
const stakeBtn = document.getElementById('stakeBtn');
const stakeBtnText = document.getElementById('stakeBtnText');
const unstakeBtn = document.getElementById('unstakeBtn');
const unstakeBtnText = document.getElementById('unstakeBtnText');
const claimBtn = document.getElementById('claimBtn');
const claimBtnText = document.getElementById('claimBtnText');
const refreshPoolsBtn = document.getElementById('refreshPoolsBtn');

// Stats elements
const totalApy = document.getElementById('totalApy');
const totalStakers = document.getElementById('totalStakers');
const totalValueLocked = document.getElementById('totalValueLocked');
const antPerBlock = document.getElementById('antPerBlock');
const poolCount = document.getElementById('poolCount');
const poolsLoadingText = document.getElementById('poolsLoadingText');

// Modal elements
const transactionModal = document.getElementById('transactionModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalSpinner = document.getElementById('modalSpinner');
const txStatus = document.getElementById('txStatus');
const txHashLink = document.getElementById('txHashLink');
const closeTxModal = document.getElementById('closeTxModal');
const closeModal = document.getElementById('closeModal');

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 ENiAC Staking DApp Initializing...');
    
    try {
        await initializeApp();
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
        hideLoading();
    }
});

async function initializeApp() {
    // Check for MetaMask
    if (typeof window.ethereum === 'undefined') {
        console.log('❌ MetaMask not detected');
        updateUIForNoWallet();
        hideLoading();
        return;
    }
    
    console.log('✅ MetaMask detected');
    
    try {
        // Create provider
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        
        // Get initial chain ID
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        console.log('🌐 Initial chain ID:', chainId);
        
        // Check if already connected
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            console.log('🔑 Found cached account:', accounts[0]);
            userAddress = accounts[0];
            await initializeContracts();
            await updateUI();
        }
        
        // Setup event listeners
        setupEventListeners();
        
        isInitialized = true;
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showNotification('Initialization error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function setupEventListeners() {
    // Wallet connection
    connectBtn.addEventListener('click', handleConnect);
    
    // Amount buttons
    maxBtn.addEventListener('click', () => setAmount('max'));
    halfBtn.addEventListener('click', () => setAmount('half'));
    
    // Transaction buttons
    approveBtn.addEventListener('click', handleApprove);
    stakeBtn.addEventListener('click', handleStake);
    unstakeBtn.addEventListener('click', handleUnstake);
    claimBtn.addEventListener('click', handleClaim);
    
    // Refresh pools
    refreshPoolsBtn.addEventListener('click', loadPools);
    
    // Modal close buttons
    closeModal.addEventListener('click', () => hideModal());
    closeTxModal.addEventListener('click', () => hideModal());
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === transactionModal) hideModal();
    });
    
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
    if (isConnecting) return;
    
    if (!window.ethereum) {
        showNotification('Please install MetaMask first!', 'error');
        window.open('https://metamask.io/download/', '_blank');
        return;
    }
    
    isConnecting = true;
    connectBtn.disabled = true;
    connectBtnText.textContent = 'Connecting...';
    
    try {
        showModal('Connecting Wallet', 'Please approve the connection in MetaMask...');
        
        // Request accounts
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }
        
        userAddress = accounts[0];
        console.log('✅ Connected account:', userAddress);
        
        // Re-initialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        signer = provider.getSigner();
        
        // Get chain ID
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        // Initialize contracts
        await initializeContracts();
        
        // Update UI
        await updateUI();
        
        hideModal();
        showNotification('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        
        let errorMessage = 'Failed to connect wallet';
        if (error.code === 4001) {
            errorMessage = 'Connection rejected by user';
        } else if (error.message.includes('User rejected')) {
            errorMessage = 'Connection rejected';
        } else {
            errorMessage = error.message;
        }
        
        hideModal();
        showNotification(errorMessage, 'error');
        
        // Reset connection state
        userAddress = null;
        await updateUI();
        
    } finally {
        isConnecting = false;
        connectBtn.disabled = false;
        connectBtnText.textContent = userAddress ? 'Connected' : 'Connect Wallet';
    }
}

async function initializeContracts() {
    try {
        console.log('📝 Initializing contracts...');
        
        // Get signer
        signer = provider.getSigner();
        
        // Initialize contracts with signer
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Get token decimals
        try {
            tokenDecimals = await eniacContract.decimals();
            console.log('✅ Token decimals:', tokenDecimals);
        } catch (error) {
            console.log('⚠️ Could not get decimals, using default 18');
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
        showNotification('Wallet disconnected', 'warning');
    } else {
        // Account changed
        userAddress = accounts[0];
        console.log('🔄 New account:', userAddress);
        
        // Re-initialize with new account
        await initializeContracts();
    }
    
    await updateUI();
}

async function handleChainChanged(newChainId) {
    console.log('🔗 Chain changed to:', newChainId);
    
    // Convert hex to decimal
    chainId = parseInt(newChainId, 16);
    
    // Reload everything
    window.location.reload();
}

function handleDisconnect(error) {
    console.log('🔌 Disconnected:', error);
    userAddress = null;
    updateUI();
    showNotification('Wallet disconnected', 'warning');
}

// ============================
// UI UPDATES
// ============================
async function updateUI() {
    console.log('🔄 Updating UI...');
    
    // Update wallet display
    if (userAddress) {
        const shortAddress = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
        walletAddress.textContent = shortAddress;
        walletAddress.title = userAddress;
        
        connectBtnText.textContent = 'Connected';
        connectBtn.classList.add('connected');
        
        // Update wallet status
        walletStatus.innerHTML = `
            <i class="fas fa-check-circle" style="color: #10b981"></i>
            <p>Wallet connected: ${shortAddress}</p>
        `;
        
        infoText.textContent = 'Enter amount to stake/unstake or claim rewards';
        
        // Enable form inputs
        stakeAmount.disabled = false;
        maxBtn.disabled = false;
        halfBtn.disabled = false;
        
    } else {
        walletAddress.textContent = 'Not Connected';
        connectBtnText.textContent = 'Connect Wallet';
        connectBtn.classList.remove('connected');
        
        walletStatus.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <p>Connect your wallet to start staking</p>
        `;
        
        infoText.textContent = 'Connect your wallet to start staking ENiAC tokens and earning rewards.';
        
        // Disable form inputs
        stakeAmount.disabled = true;
        maxBtn.disabled = true;
        halfBtn.disabled = true;
    }
    
    // Update network status
    updateNetworkStatus();
    
    // Update connection status in footer
    connectionStatus.textContent = userAddress ? 'Connected' : 'Disconnected';
    connectionStatus.style.color = userAddress ? '#10b981' : '#ef4444';
    chainIdElement.textContent = chainId || '--';
    
    // Load data if connected
    if (userAddress) {
        await loadUserData();
        await loadPools();
        await loadGlobalStats();
    } else {
        clearData();
    }
    
    // Update button states
    updateButtonStates();
}

function updateNetworkStatus() {
    const networkInfo = getNetworkInfo(chainId);
    
    // Update network badge
    networkBadge.innerHTML = `
        <i class="fas fa-circle" style="color: ${networkInfo.color}"></i>
        <span>${networkInfo.name}</span>
    `;
    networkBadge.style.background = `rgba(${hexToRgb(networkInfo.color)}, 0.2)`;
    networkBadge.style.color = networkInfo.color;
    
    // Update network status badge
    networkStatus.textContent = networkInfo.isMainnet ? 'Mainnet' : 'Testnet';
    networkStatus.style.background = networkInfo.isMainnet 
        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    
    // Show/hide network warning
    networkWarning.style.display = networkInfo.isMainnet ? 'none' : 'flex';
    
    // Update pools loading text
    if (!userAddress) {
        poolsLoadingText.textContent = 'Connect wallet to view pools';
    } else if (!networkInfo.isMainnet) {
        poolsLoadingText.textContent = 'Switch to Mainnet to view pools';
    } else {
        poolsLoadingText.textContent = 'Loading pools...';
    }
}

function getNetworkInfo(chainId) {
    const networks = {
        1: { name: 'Ethereum Mainnet', color: '#10b981', isMainnet: true },
        5: { name: 'Goerli Testnet', color: '#f59e0b', isMainnet: false },
        11155111: { name: 'Sepolia Testnet', color: '#8b5cf6', isMainnet: false },
        56: { name: 'BSC Mainnet', color: '#f0b90b', isMainnet: false },
        137: { name: 'Polygon', color: '#8b5cf6', isMainnet: false }
    };
    
    return networks[chainId] || { 
        name: `Chain ${chainId}`, 
        color: '#94a3b8', 
        isMainnet: false 
    };
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

function updateButtonStates() {
    const hasWallet = !!userAddress;
    const networkInfo = getNetworkInfo(chainId);
    const isOnMainnet = networkInfo.isMainnet;
    
    // Basic enable/disable based on connection
    approveBtn.disabled = !hasWallet || !isOnMainnet;
    stakeBtn.disabled = !hasWallet || !isOnMainnet;
    unstakeBtn.disabled = !hasWallet || !isOnMainnet;
    claimBtn.disabled = !hasWallet || !isOnMainnet;
    refreshPoolsBtn.disabled = !hasWallet || !isOnMainnet;
    
    // Update button texts
    if (!hasWallet) {
        approveBtnText.textContent = 'Connect Wallet';
        stakeBtnText.textContent = 'Connect Wallet';
        unstakeBtnText.textContent = 'Connect Wallet';
        claimBtnText.textContent = 'Connect Wallet';
    } else if (!isOnMainnet) {
        approveBtnText.textContent = 'Switch to Mainnet';
        stakeBtnText.textContent = 'Switch to Mainnet';
        unstakeBtnText.textContent = 'Switch to Mainnet';
        claimBtnText.textContent = 'Switch to Mainnet';
    } else {
        approveBtnText.textContent = 'Approve ENiAC';
        stakeBtnText.textContent = 'Stake';
        unstakeBtnText.textContent = 'Unstake';
        claimBtnText.textContent = 'Claim Rewards';
    }
}

function updateUIForNoWallet() {
    connectBtnText.textContent = 'Install MetaMask';
    connectBtn.onclick = () => {
        window.open('https://metamask.io/download/', '_blank');
    };
    
    networkBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No Wallet';
    networkBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    networkBadge.style.color = '#f87171';
    
    walletStatus.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="color: #f59e0b"></i>
        <p>Please install MetaMask to use this dApp</p>
    `;
    
    connectionStatus.textContent = 'No Wallet';
    connectionStatus.style.color = '#f59e0b';
}

// ============================
// DATA LOADING
// ============================
async function loadUserData() {
    if (!userAddress || !eniacContract || !masterchefContract) return;
    
    console.log('📊 Loading user data...');
    
    try {
        // Load ENiAC balance
        const balance = await eniacContract.balanceOf(userAddress);
        const formattedBalance = ethers.utils.formatUnits(balance, tokenDecimals);
        walletBalance.textContent = `${parseFloat(formattedBalance).toFixed(4)} ENiAC`;
        availableBalance.textContent = parseFloat(formattedBalance).toFixed(4);
        
        // Try to find ENiAC single stake pool
        try {
            const poolLength = await masterchefContract.poolLength();
            console.log(`Found ${poolLength} pools`);
            
            // Look for ENiAC token pool
            for (let i = 0; i < poolLength; i++) {
                try {
                    const pool = await masterchefContract.poolInfo(i);
                    if (pool.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                        currentPoolId = i;
                        console.log(`✅ Found ENiAC pool at ID: ${i}`);
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // If not found, use pool 0
            if (currentPoolId === null && poolLength > 0) {
                currentPoolId = 0;
                console.log(`⚠️ Using pool 0 as default`);
            }
            
            // Load staking data
            if (currentPoolId !== null) {
                const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
                const staked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
                stakedAmount.textContent = `${parseFloat(staked).toFixed(4)} ENiAC`;
                
                // Load pending rewards
                const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
                const pendingFormatted = ethers.utils.formatUnits(pending, tokenDecimals);
                pendingRewards.textContent = `${parseFloat(pendingFormatted).toFixed(4)} ENiAC`;
            }
            
        } catch (poolError) {
            console.error('❌ Pool data error:', poolError);
            stakedAmount.textContent = 'Error';
            pendingRewards.textContent = 'Error';
        }
        
        // Check allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, tokenDecimals);
        allowanceAmount.textContent = `${parseFloat(allowanceFormatted).toFixed(4)} ENiAC`;
        
        // Update approve button based on allowance
        if (parseFloat(allowanceFormatted) > 0) {
            approveBtnText.textContent = 'Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else {
            approveBtnText.textContent = 'Approve ENiAC';
            approveBtn.disabled = false;
            approveBtn.style.background = '';
        }
        
        console.log('✅ User data loaded');
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showNotification('Error loading user data: ' + error.message, 'error');
    }
}

async function loadPools() {
    if (!masterchefContract) return;
    
    console.log('🏊 Loading pools...');
    
    try {
        poolsList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading pools from blockchain...</p>
            </div>
        `;
        
        const poolLength = await masterchefContract.poolLength();
        poolCount.textContent = `${poolLength} Pools`;
        
        if (poolLength === 0) {
            poolsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-swimming-pool"></i>
                    <p>No pools found</p>
                </div>
            `;
            return;
        }
        
        let poolsHTML = '';
        
        // Load first few pools only (for performance)
        const poolsToLoad = Math.min(poolLength, 5);
        
        for (let i = 0; i < poolsToLoad; i++) {
            try {
                const poolInfo = await masterchefContract.poolInfo(i);
                const isEniacPool = poolInfo.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase();
                
                let userStaked = '0';
                let userRewards = '0';
                
                if (userAddress) {
                    const userInfo = await masterchefContract.userInfo(i, userAddress);
                    userStaked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
                    
                    const pending = await masterchefContract.pendingANT(i, userAddress);
                    userRewards = ethers.utils.formatUnits(pending, tokenDecimals);
                }
                
                poolsHTML += `
                    <div class="pool-item" onclick="viewPool(${i})">
                        <div class="pool-header">
                            <div class="pool-title">
                                <div class="pool-icon" style="background: ${isEniacPool ? 'rgba(59, 130, 246, 0.2)' : 'rgba(34, 197, 94, 0.2)'};">
                                    <i class="fas ${isEniacPool ? 'fa-gem' : 'fa-water'}" style="color: ${isEniacPool ? '#60a5fa' : '#4ade80'}"></i>
                                </div>
                                <div class="pool-name">
                                    <h3>${isEniacPool ? 'ENiAC Single' : 'LP Pool'} #${i}</h3>
                                    <div class="pool-tags">
                                        <span class="pool-tag primary">${poolInfo.allocPoint.toString()} Points</span>
                                        ${i === currentPoolId ? '<span class="pool-tag success">Active</span>' : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="pool-apy">
                                <div class="apy-value">${(poolInfo.allocPoint / 10).toFixed(1)}%</div>
                                <div class="apy-label">APY</div>
                            </div>
                        </div>
                        <div class="pool-details">
                            <div class="pool-detail">
                                <span class="pool-detail-label">Your Stake</span>
                                <span class="pool-detail-value">${parseFloat(userStaked).toFixed(4)}</span>
                            </div>
                            <div class="pool-detail">
                                <span class="pool-detail-label">Rewards</span>
                                <span class="pool-detail-value" style="color: #f59e0b;">${parseFloat(userRewards).toFixed(4)}</span>
                            </div>
                        </div>
                    </div>
                `;
                
            } catch (error) {
                console.error(`Error loading pool ${i}:`, error);
                continue;
            }
        }
        
        poolsList.innerHTML = poolsHTML;
        console.log(`✅ Loaded ${poolsToLoad} pools`);
        
    } catch (error) {
        console.error('❌ Error loading pools:', error);
        poolsList.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading pools: ${error.message}</p>
            </div>
        `;
    }
}

async function loadGlobalStats() {
    if (!masterchefContract) return;
    
    try {
        // Load ENiAC per block
        const antPerBlockValue = await masterchefContract.ANTPerBlock();
        antPerBlock.textContent = parseFloat(ethers.utils.formatUnits(antPerBlockValue, tokenDecimals)).toFixed(4) + '/block';
        
        // Estimate APY
        const blocksPerDay = 7200;
        const dailyRewards = parseFloat(ethers.utils.formatUnits(antPerBlockValue, tokenDecimals)) * blocksPerDay;
        const estimatedAPY = (dailyRewards * 365 * 100).toFixed(1);
        totalApy.textContent = estimatedAPY + '%';
        
        // Placeholder values
        totalStakers.textContent = 'Loading...';
        totalValueLocked.textContent = 'Loading...';
        
    } catch (error) {
        console.error('Error loading global stats:', error);
    }
}

function clearData() {
    walletBalance.textContent = '0 ENiAC';
    stakedAmount.textContent = '0 ENiAC';
    pendingRewards.textContent = '0 ENiAC';
    allowanceAmount.textContent = '0 ENiAC';
    availableBalance.textContent = '0';
    stakeAmount.value = '';
    
    totalApy.textContent = '--%';
    totalStakers.textContent = '--';
    totalValueLocked.textContent = '--';
    antPerBlock.textContent = '--';
    
    poolsList.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-wallet"></i>
            <p>Connect wallet to view pools</p>
        </div>
    `;
}

// ============================
// TRANSACTION HANDLERS
// ============================
function setAmount(type) {
    if (!userAddress) {
        showNotification('Please connect wallet first', 'warning');
        return;
    }
    
    const available = parseFloat(availableBalance.textContent);
    const staked = parseFloat(stakedAmount.textContent.split(' ')[0]);
    
    if (isNaN(available) || isNaN(staked)) {
        showNotification('Please wait for data to load', 'warning');
        return;
    }
    
    let amount = 0;
    
    switch (type) {
        case 'max':
            amount = available;
            break;
        case 'half':
            amount = available / 2;
            break;
    }
    
    stakeAmount.value = amount.toFixed(4);
}

async function handleApprove() {
    if (!userAddress) {
        showNotification('Please connect wallet first', 'warning');
        return;
    }
    
    const amount = stakeAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
        showNotification('Please enter a valid amount', 'warning');
        return;
    }
    
    try {
        showModal('Approving ENiAC', 'Please approve the transaction in MetaMask...');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Estimate gas
        const gasEstimate = await eniacContract.estimateGas.approve(CONFIG.MASTERCHEF, amountWei);
        const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
        
        console.log('⛽ Gas estimate:', gasEstimate.toString());
        
        // Send transaction with gas limit
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, amountWei, {
            gasLimit: gasLimit
        });
        
        updateModal('Approving ENiAC', 'Transaction submitted. Waiting for confirmation...', tx.hash);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            updateModal('Approval Successful', 'Tokens approved successfully!', tx.hash, 'success');
            
            setTimeout(() => {
                hideModal();
                showNotification('ENiAC tokens approved for staking!', 'success');
                loadUserData(); // Refresh allowance
            }, 2000);
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Approval error:', error);
        
        let errorMessage = 'Approval failed';
        if (error.code === 4001) {
            errorMessage = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient ETH for gas fees';
        } else {
            errorMessage = error.message;
        }
        
        updateModal('Approval Failed', errorMessage, null, 'error');
        
        setTimeout(() => {
            hideModal();
            showNotification(errorMessage, 'error');
        }, 3000);
    }
}

async function handleStake() {
    if (!userAddress) {
        showNotification('Please connect wallet first', 'warning');
        return;
    }
    
    if (currentPoolId === null) {
        showNotification('Could not find staking pool', 'error');
        return;
    }
    
    const amount = stakeAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
        showNotification('Please enter a valid amount', 'warning');
        return;
    }
    
    try {
        showModal('Staking ENiAC', 'Please confirm the stake transaction...');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Check allowance first
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        if (allowance.lt(amountWei)) {
            hideModal();
            showNotification('Please approve tokens first', 'warning');
            return;
        }
        
        // Estimate gas for deposit
        const gasEstimate = await masterchefContract.estimateGas.deposit(currentPoolId, amountWei);
        const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
        
        console.log('⛽ Deposit gas estimate:', gasEstimate.toString());
        
        // Send deposit transaction
        const tx = await masterchefContract.deposit(currentPoolId, amountWei, {
            gasLimit: gasLimit
        });
        
        updateModal('Staking ENiAC', 'Transaction submitted. Waiting for confirmation...', tx.hash);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            updateModal('Stake Successful', `${amount} ENiAC staked successfully!`, tx.hash, 'success');
            
            setTimeout(() => {
                hideModal();
                showNotification(`Successfully staked ${amount} ENiAC!`, 'success');
                
                // Reset and reload
                stakeAmount.value = '';
                loadUserData();
                loadPools();
                
            }, 2000);
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Stake error:', error);
        
        let errorMessage = 'Stake failed';
        if (error.code === 4001) {
            errorMessage = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient ETH for gas fees';
        } else if (error.message.includes('allowance')) {
            errorMessage = 'Insufficient allowance. Please approve more tokens.';
        } else {
            errorMessage = error.message;
        }
        
        updateModal('Stake Failed', errorMessage, null, 'error');
        
        setTimeout(() => {
            hideModal();
            showNotification(errorMessage, 'error');
        }, 3000);
    }
}

async function handleUnstake() {
    if (!userAddress) {
        showNotification('Please connect wallet first', 'warning');
        return;
    }
    
    if (currentPoolId === null) {
        showNotification('Could not find staking pool', 'error');
        return;
    }
    
    const amount = stakeAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
        showNotification('Please enter a valid amount', 'warning');
        return;
    }
    
    try {
        showModal('Unstaking ENiAC', 'Please confirm the unstake transaction...');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Estimate gas for withdraw
        const gasEstimate = await masterchefContract.estimateGas.withdraw(currentPoolId, amountWei);
        const gasLimit = gasEstimate.mul(120).div(100);
        
        console.log('⛽ Withdraw gas estimate:', gasEstimate.toString());
        
        // Send withdraw transaction
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei, {
            gasLimit: gasLimit
        });
        
        updateModal('Unstaking ENiAC', 'Transaction submitted. Waiting for confirmation...', tx.hash);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            updateModal('Unstake Successful', `${amount} ENiAC unstaked successfully!`, tx.hash, 'success');
            
            setTimeout(() => {
                hideModal();
                showNotification(`Successfully unstaked ${amount} ENiAC!`, 'success');
                
                // Reset and reload
                stakeAmount.value = '';
                loadUserData();
                loadPools();
                
            }, 2000);
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Unstake error:', error);
        
        let errorMessage = 'Unstake failed';
        if (error.code === 4001) {
            errorMessage = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient ETH for gas fees';
        } else if (error.message.includes('withdraw: not good')) {
            errorMessage = 'Insufficient staked amount';
        } else {
            errorMessage = error.message;
        }
        
        updateModal('Unstake Failed', errorMessage, null, 'error');
        
        setTimeout(() => {
            hideModal();
            showNotification(errorMessage, 'error');
        }, 3000);
    }
}

async function handleClaim() {
    if (!userAddress) {
        showNotification('Please connect wallet first', 'warning');
        return;
    }
    
    if (currentPoolId === null) {
        showNotification('Could not find staking pool', 'error');
        return;
    }
    
    try {
        showModal('Claiming Rewards', 'Please confirm the claim transaction...');
        
        // Check pending rewards first
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingAmount = ethers.utils.formatUnits(pending, tokenDecimals);
        
        if (parseFloat(pendingAmount) <= 0) {
            hideModal();
            showNotification('No rewards to claim', 'warning');
            return;
        }
        
        // Withdraw 0 to claim rewards
        const gasEstimate = await masterchefContract.estimateGas.withdraw(currentPoolId, 0);
        const gasLimit = gasEstimate.mul(120).div(100);
        
        console.log('⛽ Claim gas estimate:', gasEstimate.toString());
        
        const tx = await masterchefContract.withdraw(currentPoolId, 0, {
            gasLimit: gasLimit
        });
        
        updateModal('Claiming Rewards', 'Transaction submitted. Waiting for confirmation...', tx.hash);
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            updateModal('Claim Successful', `${parseFloat(pendingAmount).toFixed(4)} ENiAC claimed!`, tx.hash, 'success');
            
            setTimeout(() => {
                hideModal();
                showNotification(`Successfully claimed ${parseFloat(pendingAmount).toFixed(4)} ENiAC!`, 'success');
                
                // Reload data
                loadUserData();
                loadPools();
                
            }, 2000);
            
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('❌ Claim error:', error);
        
        let errorMessage = 'Claim failed';
        if (error.code === 4001) {
            errorMessage = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient ETH for gas fees';
        } else {
            errorMessage = error.message;
        }
        
        updateModal('Claim Failed', errorMessage, null, 'error');
        
        setTimeout(() => {
            hideModal();
            showNotification(errorMessage, 'error');
        }, 3000);
    }
}

// ============================
// MODAL FUNCTIONS
// ============================
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalSpinner.style.display = 'block';
    
    // Reset status
    txStatus.textContent = 'Pending';
    txStatus.style.color = '#f59e0b';
    txHashLink.textContent = '--';
    txHashLink.href = '#';
    
    transactionModal.style.display = 'flex';
}

function updateModal(title, message, txHash, status = 'pending') {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    txStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    
    if (status === 'success') {
        txStatus.style.color = '#10b981';
        modalSpinner.style.display = 'none';
    } else if (status === 'error') {
        txStatus.style.color = '#ef4444';
        modalSpinner.style.display = 'none';
    } else {
        txStatus.style.color = '#f59e0b';
        modalSpinner.style.display = 'block';
    }
    
    if (txHash) {
        const shortHash = `${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`;
        txHashLink.textContent = shortHash;
        txHashLink.href = `https://etherscan.io/tx/${txHash}`;
        txHashLink.target = '_blank';
    }
}

function hideModal() {
    transactionModal.style.display = 'none';
}

// ============================
// HELPER FUNCTIONS
// ============================
function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification-toast');
    existing.forEach(n => n.remove());
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification-toast notification-${type}`;
    
    // Set icon based on type
    let icon = 'fa-check-circle';
    let bgColor = 'linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%)';
    
    if (type === 'error') {
        icon = 'fa-exclamation-circle';
        bgColor = 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)';
    } else if (type === 'warning') {
        icon = 'fa-exclamation-triangle';
        bgColor = 'linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(217, 119, 6, 0.9) 100%)';
    } else if (type === 'info') {
        icon = 'fa-info-circle';
        bgColor = 'linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(29, 78, 216, 0.9) 100%)';
    }
    
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Style notification
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '12px 20px';
    notification.style.borderRadius = '10px';
    notification.style.color = 'white';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.style.maxWidth = '400px';
    notification.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.3)';
    notification.style.animation = 'slideInRight 0.3s ease';
    notification.style.fontWeight = '500';
    notification.style.backdropFilter = 'blur(10px)';
    notification.style.background = bgColor;
    notification.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    notification.style.fontSize = '0.95rem';
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function hideLoading() {
    loadingOverlay.style.opacity = '0';
    setTimeout(() => {
        loadingOverlay.style.display = 'none';
    }, 300);
}

// ============================
// GLOBAL FUNCTIONS
// ============================
window.viewPool = function(poolId) {
    showNotification(`Viewing pool ${poolId} - Feature coming soon!`, 'info');
};

// Add animation keyframes if not exists
if (!document.getElementById('notificationAnimations')) {
    const style = document.createElement('style');
    style.id = 'notificationAnimations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

console.log('✅ ENiAC Staking DApp initialized');