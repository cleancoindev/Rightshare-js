// tslint:disable no-if-statement
// tslint:disable no-object-mutation
// tslint:disable no-expression-statement
import Web3 from 'web3';

import FRight from './ABIs/FRightABI.json';
import IRight from './ABIs/IRightABI.json';
import NFT from './ABIs/NFTABI.json';
import RightsDao from './ABIs/RightsDaoABI.json';

import api from './axios';
import requests from './requests';

const call = (method: (...args: any) => any) => (...args: any) =>
  method(...args).call() as Promise<any>;
const send = (method: (...args: any) => any) => (...args: any) => {
  const option = args.pop();
  const transaction = method(...args);
  return {
    estimate: (): Promise<any> =>
      transaction.estimateGas(option) as Promise<any>,
    send: (): Promise<any> => transaction.send(option) as Promise<any>,
    transaction
  };
};

interface Options {
  readonly apiURL: string;
  readonly apiKey: string;
  readonly onEvent?: (type: string, payload: any, error: any) => void;
  readonly addresses: any;
}

export default (provider: any, options: Options) => {
  const instance = new Web3(provider);
  const { addresses } = options;
  const contracts = {
    FRight: new instance.eth.Contract(FRight as any, addresses.FRight),
    IRight: new instance.eth.Contract(IRight as any, addresses.IRight),
    RightsDao: new instance.eth.Contract(RightsDao as any, addresses.RightsDao)
  };

  const hasRight = (
    addr: string,
    id: number | string,
    ethAddress: string,
    moderatorContract: any,
    tokenContract: any
  ) => {
    return new Promise(resolve => {
      // tslint:disable-next-line: no-expression-statement
      moderatorContract.methods
        .isFrozen(addr, id)
        .call()
        .then((isFrozen: boolean) => {
          if (isFrozen) {
            // tslint:disable-next-line: no-expression-statement
            tokenContract.methods
              .currentTokenId()
              .call()
              .then(async (tokenId: number) => {
                if (tokenId !== 0) {
                  // tslint:disable-next-line: no-let
                  for (let i = 1; i <= tokenId; i++) {
                    const owner = await tokenContract.methods.ownerOf(i).call();
                    if (owner.toLowerCase() === ethAddress.toLowerCase()) {
                      const {
                        baseAssetAddress,
                        baseAssetId,
                        endTime
                      } = await tokenContract.methods.metadata(i).call();
                      if (
                        baseAssetAddress.toLowerCase() === addr.toLowerCase() &&
                        baseAssetId === id &&
                        endTime > Date.now() / 1000
                      ) {
                        // tslint:disable-next-line: no-expression-statement
                        resolve(true);
                        break;
                      }
                    }
                  }
                } else {
                  // tslint:disable-next-line: no-expression-statement
                  resolve(false);
                }
              });
          } else {
            // tslint:disable-next-line: no-expression-statement
            resolve(false);
          }
        });
    });
  };

  const methods = {
    FRight: {
      baseAsset: call(contracts.FRight.methods.baseAsset),
      hasFRight: (addr: string, id: number | string, ethAddress: string) =>
        hasRight(addr, id, ethAddress, contracts.FRight, contracts.FRight),
      isFrozen: call(contracts.FRight.methods.isFrozen),
      isIMintable: call(contracts.FRight.methods.isIMintable),
      isUnfreezable: call(contracts.FRight.methods.isUnfreezable),
      metadata: call(contracts.FRight.methods.metadata),
      tokenURI: call(contracts.FRight.methods.tokenURI)
    },
    IRight: {
      baseAsset: call(contracts.IRight.methods.baseAsset),
      fetchRights: (ethAddr: string, nftAddr: string, id: number | string) => {
        return new Promise((resolve, reject) => {
          call(contracts.IRight.methods.totalNFTRights)(ethAddr, nftAddr, id)
            .then((totalRights: number) => {
              return Promise.all(
                new Array(Number(totalRights)).fill(1).map((...args) => {
                  return new Promise((resolveId, rejectId) => {
                    call(contracts.IRight.methods.NFTRightByIndex)(
                      ethAddr,
                      nftAddr,
                      id,
                      args[1]
                    )
                      .then((rightId: number) =>
                        call(contracts.IRight.methods.metadata)(rightId)
                          .then(resolveId)
                          .catch(rejectId)
                      )
                      .catch(rejectId);
                  });
                })
              )
                .then(resolve)
                .catch(reject);
            })
            .catch(reject);
        });
      },
      hasIRight: (addr: string, id: number | string, ethAddress: string) =>
        hasRight(addr, id, ethAddress, contracts.FRight, contracts.IRight),
      metadata: call(contracts.IRight.methods.metadata),
      tokenURI: call(contracts.IRight.methods.tokenURI),
      totalNFTRights: call(contracts.IRight.methods.totalNFTRights),
      transfer: send(contracts.IRight.methods.transferFrom)
    },
    NFT: {
      approve: (addr: string) => {
        const contract = new instance.eth.Contract(NFT as any, addr);
        return send(contract.methods.approve);
      }
    },
    RightsDao: {
      // currentFVersion: call(contracts.RightsDao.methods.currentFVersion),
      // currentIVersion: call(contracts.RightsDao.methods.currentIVersion),
      freeze: send(contracts.RightsDao.methods.freeze),
      issueI: send(contracts.RightsDao.methods.issueI),
      // issueUnencumberedI: send(contracts.RightsDao.methods.issueUnencumberedI),
      revokeI: send(contracts.RightsDao.methods.revokeI),
      unfreeze: send(contracts.RightsDao.methods.unfreeze)
    },
    addresses: {
      getName: (addr: string) =>
        Object.keys(addresses).find(
          k => addresses[k].toLowerCase() === addr.toLowerCase()
        )
    },
    web3: {
      setProvider: (prov: any) => {
        instance.setProvider(prov);
        contracts.FRight = new instance.eth.Contract(
          FRight as any,
          addresses.FRight
        );
        contracts.IRight = new instance.eth.Contract(
          IRight as any,
          addresses.IRight
        );
        contracts.RightsDao = new instance.eth.Contract(
          RightsDao as any,
          addresses.RightsDao
        );
      }
    }
  };

  const { request, axios } = api(options.apiKey, options.apiURL);
  const apis = requests(request);

  return {
    addresses,
    apis,
    axios,
    contracts,
    methods,
    web3: instance
  };
};
