import {Skill} from "@paintswap/estfor-definitions/types";
import {ethers, upgrades} from "hardhat";
import {AvatarInfo, createPlayer} from "../../scripts/utils";
import {ItemNFT, PlayerNFT, Shop, World} from "../../typechain-types";

export const playersFixture = async function () {
  const [owner, alice, bob, charlie] = await ethers.getSigners();

  const MockBrushToken = await ethers.getContractFactory("MockBrushToken");
  const brush = await MockBrushToken.deploy();

  const MockOracleClient = await ethers.getContractFactory("MockOracleClient");
  const mockOracleClient = await MockOracleClient.deploy();

  // Add some dummy blocks so that world can access previous blocks for random numbers
  for (let i = 0; i < 5; ++i) {
    await owner.sendTransaction({
      to: owner.address,
      value: 1,
    });
  }

  // Create the world
  const subscriptionId = 2;
  const World = await ethers.getContractFactory("World");
  const world = (await upgrades.deployProxy(World, [mockOracleClient.address, subscriptionId], {
    kind: "uups",
  })) as World;

  const Shop = await ethers.getContractFactory("Shop");
  const shop = (await upgrades.deployProxy(Shop, [brush.address], {
    kind: "uups",
  })) as Shop;

  const buyPath: [string, string] = [alice.address, brush.address];
  const MockRouter = await ethers.getContractFactory("MockRouter");
  const router = await MockRouter.deploy();
  const RoyaltyReceiver = await ethers.getContractFactory("RoyaltyReceiver");
  const royaltyReceiver = await upgrades.deployProxy(
    RoyaltyReceiver,
    [router.address, shop.address, brush.address, buyPath],
    {
      kind: "uups",
    }
  );
  await royaltyReceiver.deployed();

  const admins = [owner.address, alice.address];
  const AdminAccess = await ethers.getContractFactory("AdminAccess");
  const adminAccess = await upgrades.deployProxy(AdminAccess, [admins], {
    kind: "uups",
  });
  await adminAccess.deployed();

  const isAlpha = true;

  // Create NFT contract which contains all items
  const ItemNFT = await ethers.getContractFactory("ItemNFT");
  const itemsUri = "ipfs://";
  const itemNFT = (await upgrades.deployProxy(
    ItemNFT,
    [world.address, shop.address, royaltyReceiver.address, adminAccess.address, itemsUri, isAlpha],
    {
      kind: "uups",
    }
  )) as ItemNFT;

  await shop.setItemNFT(itemNFT.address);
  // Create NFT contract which contains all the players
  const PlayerNFT = await ethers.getContractFactory("PlayerNFT");
  const editNameBrushPrice = ethers.utils.parseEther("1");
  const imageBaseUri = "ipfs://";
  const playerNFT = (await upgrades.deployProxy(
    PlayerNFT,
    [
      brush.address,
      shop.address,
      royaltyReceiver.address,
      adminAccess.address,
      editNameBrushPrice,
      imageBaseUri,
      isAlpha,
    ],
    {
      kind: "uups",
    }
  )) as PlayerNFT;

  const Quests = await ethers.getContractFactory("Quests");
  const quests = await upgrades.deployProxy(Quests, [world.address, router.address, buyPath], {
    kind: "uups",
  });

  const Clans = await ethers.getContractFactory("Clans");
  const clans = await upgrades.deployProxy(Clans, [brush.address, shop.address], {
    kind: "uups",
  });

  const Bank = await ethers.getContractFactory("Bank");
  const bank = await Bank.deploy();

  const BankRegistry = await ethers.getContractFactory("BankRegistry");
  const bankRegistry = await upgrades.deployProxy(
    BankRegistry,
    [bank.address, itemNFT.address, playerNFT.address, clans.address],
    {
      kind: "uups",
    }
  );

  const BankProxy = await ethers.getContractFactory("BankProxy");
  const bankProxy = await BankProxy.deploy(bankRegistry.address);

  const BankFactory = await ethers.getContractFactory("BankFactory");
  const bankFactory = await upgrades.deployProxy(BankFactory, [bankRegistry.address, bankProxy.address], {
    kind: "uups",
  });

  // This contains all the player data
  const PlayersLibrary = await ethers.getContractFactory("PlayersLibrary");
  const playerLibrary = await PlayersLibrary.deploy();

  const PlayersImplQueueActions = await ethers.getContractFactory("PlayersImplQueueActions");
  const playersImplQueueActions = await PlayersImplQueueActions.deploy();

  const PlayersImplProcessActions = await ethers.getContractFactory("PlayersImplProcessActions", {
    libraries: {PlayersLibrary: playerLibrary.address},
  });
  const playersImplProcessActions = await PlayersImplProcessActions.deploy();

  const PlayersImplRewards = await ethers.getContractFactory("PlayersImplRewards", {
    libraries: {PlayersLibrary: playerLibrary.address},
  });
  const playersImplRewards = await PlayersImplRewards.deploy();

  const Players = await ethers.getContractFactory("Players", {
    libraries: {PlayersLibrary: playerLibrary.address},
  });

  const players = await upgrades.deployProxy(
    Players,
    [
      itemNFT.address,
      playerNFT.address,
      world.address,
      adminAccess.address,
      quests.address,
      clans.address,
      playersImplQueueActions.address,
      playersImplProcessActions.address,
      playersImplRewards.address,
      isAlpha,
    ],
    {
      kind: "uups",
      unsafeAllow: ["delegatecall", "external-library-linking"],
    }
  );

  await world.setQuests(quests.address);

  await itemNFT.setPlayers(players.address);
  await playerNFT.setPlayers(players.address);
  await quests.setPlayers(players.address);
  await clans.setPlayers(players.address);

  await clans.setBankFactory(bankFactory.address);

  const avatarId = 1;
  const avatarInfo: AvatarInfo = {
    name: ethers.utils.formatBytes32String("Name goes here"),
    description: "Hi I'm a description",
    imageURI: "1234.png",
    startSkills: [Skill.MAGIC, Skill.NONE],
  };
  await playerNFT.setAvatar(avatarId, avatarInfo);

  // Create player
  const origName = "0xSamWitch";
  const makeActive = true;
  const playerId = await createPlayer(
    playerNFT,
    avatarId,
    alice,
    ethers.utils.formatBytes32String(origName),
    makeActive
  );
  const maxTime = await players.MAX_TIME();

  return {
    playerId,
    players,
    playerNFT,
    itemNFT,
    brush,
    maxTime,
    owner,
    world,
    alice,
    bob,
    charlie,
    origName,
    editNameBrushPrice,
    mockOracleClient,
    avatarInfo,
    adminAccess,
    shop,
    royaltyReceiver,
    playersImplProcessActions,
    playersImplQueueActions,
    playersImplRewards,
    Players,
    avatarId,
    quests,
    clans,
    bank,
    Bank,
    bankRegistry,
    bankFactory,
  };
};
