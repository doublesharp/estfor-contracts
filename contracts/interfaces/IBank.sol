// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IBank {
  function initialize(uint clanId, address bankRegistry) external;
}
