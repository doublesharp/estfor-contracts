import {ethers} from "hardhat";
import {ADMIN_ACCESS_ADDRESS} from "./constants";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log(`Add admins using account: ${owner.address}`);

  const network = await ethers.provider.getNetwork();
  console.log(`ChainId: ${network.chainId}`);

  const AdminAccess = await ethers.getContractFactory("AdminAccess");
  const adminAccess = AdminAccess.attach(ADMIN_ACCESS_ADDRESS);

  await adminAccess.addAdmins([
    "0xb4dda75e5dee0a9e999152c3b72816fc1004d1dd",
    "0x1d877C5e1452A635b3Feaa47994b03C7c0976Ad3",
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
