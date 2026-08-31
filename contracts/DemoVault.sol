// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
/// @title CeloSentry Demo Lab — demo audit target, no real funds
contract DemoVault {
    mapping(address => uint256) public balances;
    address public owner;
    uint256 public totalDeposits;
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    constructor() { owner = msg.sender; }
    function deposit() external payable { balances[msg.sender] += msg.value; totalDeposits += msg.value; emit Deposit(msg.sender, msg.value); }
    function withdraw(uint256 amount) external { require(balances[msg.sender] >= amount, "insufficient balance"); balances[msg.sender] -= amount; payable(msg.sender).transfer(amount); emit Withdraw(msg.sender, amount); }
    function getBalance(address a) external view returns (uint256) { return balances[a]; }
}
