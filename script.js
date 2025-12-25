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
// CONTRACT ABIs
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)"
];

const MASTERCHEF_ABI = [
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    "function poolLength() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)"
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
let currentPoolId = 0;
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

const maxBtn = document.getElementById('maxBtn');
const approveBtn = document.getElementById('approveBtn');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimBtn = document.getElementById('claimBtn');

// Cập nhật footer thông tin
document.querySelector('.footer').innerHTML = `
    <p>ENiAC Staking Platform - Binance Smart Chain</p>
    <p class="footer-note">
        <i class="fas fa-exclamation-triangle"></i>
        You need BNB for gas fees. Make sure you're on BSC Mainnet.
    </p>
`;

// Cập nhật network info
document.querySelector('.network-info p').textContent = 
    'You need BNB for gas fees. Make sure you\'re on Binance Smart Chain Mainnet.';

// Cập nhật contract links
const contractLinks = document.querySelectorAll('.contract-details a');
contractLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href.includes('etherscan.io')) {
        const newHref = href.replace('etherscan.io', CONFIG.BSC_EXPLORER.replace('https://', ''));
        link.setAttribute('href', newHref);
    }
});

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('🚀 Initializing ENiAC Staking DApp for BSC...');
    
    try {
        // Check if MetaMask is installed
        if (typeof window.ethereum === 'undefined') {
            showStatus('Please install MetaMask to use this dApp', 'error');
            connectBtn.innerHTML = '<i class="fas fa-download"></i> Install MetaMask';
            connectBtn.onclick = () => window.open('https://metamask.io/download/', '_blank');
            return;
        }
        
        console.log('✅ MetaMask detected');
        
        // Initialize provider với BSC RPC
        provider = new ethers.providers.Web3Provider(window.ethereum);
        
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
    
    // Transaction buttons
    maxBtn.addEventListener('click', setMaxAmount);
    approveBtn.addEventListener('click', approveTokens);
    stakeBtn.addEventListener('click', stakeTokens);
    unstakeBtn.addEventListener('click', unstakeTokens);
    claimBtn.addEventListener('click', claimRewards);
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('disconnect', handleDisconnect);
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
        
        showStatus('Wallet connected to BSC successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        
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
        // Reinitialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        // Get chain ID
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        console.log('🌐 Current chain ID:', chainId);
        
        // Check if we're on BSC Mainnet
        if (chainId !== CONFIG.BSC_CHAIN_ID) {
            showStatus('Please switch to BSC Mainnet', 'warning');
            await switchToBSC();
            return;
        }
        
        // Initialize contracts
        await initializeContracts();
        
        // Update UI
        updateUI();
        
        // Load user data
        await loadUserData();
        
        // Start auto-refresh
        startAutoRefresh();
        
        isConnected = true;
        console.log('✅ Connection setup completed on BSC');
        
    } catch (error) {
        console.error('❌ Setup error:', error);
        showStatus('Setup error: ' + error.message, 'error');
        isConnected = false;
    }
}

async function switchToBSC() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }], // 0x38 = 56 in hex (BSC Mainnet)
        });
        console.log('✅ Switched to BSC Mainnet');
    } catch (switchError) {
        // If the chain hasn't been added to MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x38',
                        chainName: 'Binance Smart Chain Mainnet',
                        nativeCurrency: {
                            name: 'BNB',
                            symbol: 'BNB',
                            decimals: 18
                        },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com']
                    }]
                });
                console.log('✅ BSC Mainnet added to MetaMask');
            } catch (addError) {
                console.error('❌ Error adding BSC network:', addError);
                showStatus('Please manually add BSC network to MetaMask', 'error');
            }
        } else {
            console.error('❌ Error switching to BSC:', switchError);
            showStatus('Please manually switch to BSC Mainnet', 'error');
        }
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
        
        // Try to find the correct pool
        await findPoolId();
        
        console.log('✅ Contracts initialized on BSC');
        
    } catch (error) {
        console.error('❌ Contract initialization error:', error);
        throw error;
    }
}

async function findPoolId() {
    try {
        const poolLength = await masterchefContract.poolLength();
        console.log(`Total pools on BSC: ${poolLength}`);
        
        // Try to find pool with ENiAC token
        for (let i = 0; i < poolLength; i++) {
            try {
                const poolInfo = await masterchefContract.poolInfo(i);
                console.log(`Pool ${i}:`, poolInfo.lpToken);
                
                if (poolInfo.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                    currentPoolId = i;
                    console.log(`✅ Found ENiAC pool on BSC at ID: ${currentPoolId}`);
                    break;
                }
            } catch (e) {
                console.log(`Error checking pool ${i}:`, e.message);
                continue;
            }
        }
        
        // If not found, try pool 0
        if (currentPoolId === null || currentPoolId === undefined) {
            console.log('⚠️ ENiAC pool not found, trying pool 0');
            currentPoolId = 0;
        }
        
    } catch (error) {
        console.warn('Could not get pool length, using default pool 0');
        currentPoolId = 0;
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
        stopAutoRefresh();
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
    console.log('🔗 Chain changed to:', parseInt(newChainId));
    // Reload page
    window.location.reload();
}

function handleDisconnect() {
    console.log('🔌 Wallet disconnected');
    userAddress = null;
    isConnected = false;
    updateUI();
    clearData();
    showStatus('Wallet disconnected', 'warning');
}

// ============================
// UI UPDATES
// ============================
function updateUI() {
    if (userAddress) {
        // Update wallet info
        const shortAddress = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> <span>${shortAddress} (BSC)</span>`;
        
        // Update connect button
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
        connectBtn.disabled = false;
        
        // Enable buttons
        maxBtn.disabled = false;
        amountInput.disabled = false;
        
        // Update approve button based on current allowance
        updateApproveButton();
        
    } else {
        // Reset wallet info
        walletInfo.innerHTML = '<i class="fas fa-wallet"></i> <span>Not Connected</span>';
        
        // Reset connect button
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect Wallet';
        connectBtn.classList.remove('connected');
        connectBtn.disabled = false;
        
        // Disable buttons
        maxBtn.disabled = true;
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

async function updateApproveButton() {
    if (!userAddress || !eniacContract) return;
    
    try {
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, tokenDecimals);
        
        if (parseFloat(allowanceFormatted) > 0) {
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = '#059669';
            stakeBtn.disabled = false;
        } else {
            approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
            approveBtn.disabled = false;
            approveBtn.style.background = '#10b981';
            stakeBtn.disabled = true;
        }
        
        allowanceAmount.textContent = `${parseFloat(allowanceFormatted).toFixed(4)} ENiAC`;
    } catch (error) {
        console.error('Error checking allowance:', error);
    }
}

// ============================
// DATA LOADING
// ============================
async function loadUserData() {
    if (!userAddress || !eniacContract || !masterchefContract) {
        return;
    }
    
    console.log('📊 Loading user data from BSC...');
    
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
        
        console.log('✅ User data loaded from BSC');
        
    } catch (error) {
        console.error('❌ Error loading user data from BSC:', error);
        showStatus('Error loading data from BSC: ' + error.message, 'error');
    }
}

async function loadStakingData() {
    try {
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        const staked = ethers.utils.formatUnits(userInfo.amount, tokenDecimals);
        stakedAmount.textContent = `${parseFloat(staked).toFixed(4)} ENiAC`;
        
        // Load pending rewards
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingFormatted = ethers.utils.formatUnits(pending, tokenDecimals);
        pendingRewards.textContent = `${parseFloat(pendingFormatted).toFixed(4)} ENiAC`;
        
        // Enable/disable buttons based on staked amount
        if (parseFloat(staked) > 0) {
            unstakeBtn.disabled = false;
            claimBtn.disabled = parseFloat(pendingFormatted) <= 0;
        } else {
            unstakeBtn.disabled = true;
            claimBtn.disabled = true;
        }
        
    } catch (error) {
        console.error('Error loading staking data from BSC:', error);
        stakedAmount.textContent = '0 ENiAC';
        pendingRewards.textContent = '0 ENiAC';
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
    }
}

// ============================
// AUTO REFRESH
// ============================
let refreshInterval = null;

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(async () => {
        if (isConnected && userAddress) {
            await loadUserData();
        }
    }, 10000); // Refresh every 10 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// ============================
// TRANSACTION FUNCTIONS (BSC)
// ============================
function setMaxAmount() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const balanceText = walletBalance.textContent;
    const balance = parseFloat(balanceText.split(' ')[0]);
    
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
        showStatus('Approving ENiAC tokens on BSC...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Disable button during transaction
        approveBtn.disabled = true;
        approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving...';
        
        // Send approval transaction
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, amountWei);
        
        showStatus('Transaction submitted to BSC. Waiting for confirmation...', 'info');
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus('ENiAC tokens approved successfully on BSC!', 'success');
            
            // Update approve button
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = '#059669';
            
            // Enable stake button
            stakeBtn.disabled = false;
            
            // Reload allowance data
            await loadUserData();
            
        } else {
            throw new Error('Transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Approval error on BSC:', error);
        
        let errorMsg = 'Approval failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('User denied transaction')) {
            errorMsg = 'User denied transaction on BSC';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract error: ' + error.message;
        }
        
        showStatus(errorMsg, 'error');
        
        // Reset approve button
        approveBtn.disabled = false;
        approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
        approveBtn.style.background = '#10b981';
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
        showStatus('Staking ENiAC tokens on BSC...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Check allowance first
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        if (allowance.lt(amountWei)) {
            showStatus('Please approve tokens first', 'warning');
            return;
        }
        
        // Check wallet balance
        const balance = await eniacContract.balanceOf(userAddress);
        if (balance.lt(amountWei)) {
            showStatus('Insufficient balance on BSC', 'error');
            return;
        }
        
        // Disable button during transaction
        stakeBtn.disabled = true;
        stakeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Staking...';
        
        // Send deposit transaction
        const tx = await masterchefContract.deposit(currentPoolId, amountWei);
        
        showStatus('Transaction submitted to BSC. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully staked ${amount} ENiAC on BSC!`, 'success');
            
            // Clear input and reload data
            amountInput.value = '';
            await loadUserData();
            
            // Reset stake button
            stakeBtn.disabled = false;
            stakeBtn.innerHTML = '<i class="fas fa-lock"></i> Stake';
            
        } else {
            throw new Error('Transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Stake error on BSC:', error);
        
        let errorMsg = 'Stake failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('User denied transaction')) {
            errorMsg = 'User denied transaction on BSC';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract error: ' + error.message;
        }
        
        showStatus(errorMsg, 'error');
        
        // Reset stake button
        stakeBtn.disabled = false;
        stakeBtn.innerHTML = '<i class="fas fa-lock"></i> Stake';
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
        showStatus('Unstaking ENiAC tokens from BSC...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
        
        // Check staked balance
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        if (userInfo.amount.lt(amountWei)) {
            showStatus('Insufficient staked amount on BSC', 'error');
            return;
        }
        
        // Disable button during transaction
        unstakeBtn.disabled = true;
        unstakeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unstaking...';
        
        // Send withdraw transaction
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei);
        
        showStatus('Transaction submitted to BSC. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully unstaked ${amount} ENiAC from BSC!`, 'success');
            
            // Clear input and reload data
            amountInput.value = '';
            await loadUserData();
            
            // Reset unstake button
            unstakeBtn.disabled = false;
            unstakeBtn.innerHTML = '<i class="fas fa-unlock"></i> Unstake';
            
        } else {
            throw new Error('Transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Unstake error on BSC:', error);
        
        let errorMsg = 'Unstake failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('User denied transaction')) {
            errorMsg = 'User denied transaction on BSC';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract error: ' + error.message;
        }
        
        showStatus(errorMsg, 'error');
        
        // Reset unstake button
        unstakeBtn.disabled = false;
        unstakeBtn.innerHTML = '<i class="fas fa-unlock"></i> Unstake';
    }
}

async function claimRewards() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    try {
        // Check pending rewards first
        const pending = await masterchefContract.pendingANT(currentPoolId, userAddress);
        const pendingAmount = ethers.utils.formatUnits(pending, tokenDecimals);
        
        if (parseFloat(pendingAmount) <= 0) {
            showStatus('No rewards to claim on BSC', 'warning');
            return;
        }
        
        showStatus('Claiming rewards from BSC...', 'info');
        
        // Disable button during transaction
        claimBtn.disabled = true;
        claimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claiming...';
        
        // Send claim transaction (withdraw 0)
        const tx = await masterchefContract.withdraw(currentPoolId, 0);
        
        showStatus('Transaction submitted to BSC. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully claimed ${parseFloat(pendingAmount).toFixed(4)} ENiAC from BSC!`, 'success');
            
            // Reload data
            await loadUserData();
            
            // Reset claim button
            claimBtn.disabled = false;
            claimBtn.innerHTML = '<i class="fas fa-gift"></i> Claim Rewards';
            
        } else {
            throw new Error('Transaction failed on BSC');
        }
        
    } catch (error) {
        console.error('❌ Claim error on BSC:', error);
        
        let errorMsg = 'Claim failed on BSC';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees on BSC';
        } else if (error.message.includes('User denied transaction')) {
            errorMsg = 'User denied transaction on BSC';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract error: ' + error.message;
        }
        
        showStatus(errorMsg, 'error');
        
        // Reset claim button
        claimBtn.disabled = false;
        claimBtn.innerHTML = '<i class="fas fa-gift"></i> Claim Rewards';
    }
}

// ============================
// HELPER FUNCTIONS
// ============================
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    statusEl.classList.add(type);
    statusEl.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// ============================
// ERROR HANDLING
// ============================
window.addEventListener('error', function(event) {
    console.error('Global error on BSC:', event.error);
    showStatus('An unexpected error occurred on BSC', 'error');
});

// Add a global unhandled rejection handler
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection on BSC:', event.reason);
    showStatus('Transaction error on BSC: ' + (event.reason.message || 'Unknown error'), 'error');
});

// Initialize when page loads
window.addEventListener('load', () => {
    console.log('ENiAC Staking DApp loaded for BSC');
    showStatus('Ready to connect to BSC Mainnet', 'info');
});

// ============================
// BSC NETWORK DETECTION
// ============================
async function checkBSCConnection() {
    try {
        if (!window.ethereum) return false;
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(chainId);
        
        return currentChainId === CONFIG.BSC_CHAIN_ID;
    } catch (error) {
        return false;
    }
}

// Thêm thông tin network vào UI khi không kết nối đúng mạng
async function showNetworkWarning() {
    if (await checkBSCConnection()) return;
    
    const warningDiv = document.createElement('div');
    warningDiv.className = 'network-warning';
    warningDiv.innerHTML = `
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px; color: #92400e;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                <strong>Wrong Network</strong>
            </div>
            <p style="margin: 0; font-size: 0.9rem;">
                You are not connected to Binance Smart Chain Mainnet. 
                Please switch to BSC Mainnet (Chain ID: 56) to use this dApp.
            </p>
            <button onclick="switchToBSC()" style="margin-top: 10px; background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                <i class="fas fa-exchange-alt"></i> Switch to BSC
            </button>
        </div>
    `;
    
    const container = document.querySelector('.container');
    if (container && !document.querySelector('.network-warning')) {
        container.insertBefore(warningDiv, container.firstChild);
    }
}

// Call network warning check
setTimeout(showNetworkWarning, 1000);
